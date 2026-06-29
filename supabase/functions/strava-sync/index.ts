import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const RATE_WINDOW_MS = 60 * 60 * 1000
const STRAVA_SYNC_RATE_LIMIT = 3

type SupabaseClient = ReturnType<typeof createClient>

async function checkRateLimit(
  supabase: SupabaseClient,
  userId: string,
  functionName: string,
  limit: number,
): Promise<boolean> {
  const windowStart = new Date(Date.now() - RATE_WINDOW_MS).toISOString()
  const { count } = await supabase
    .from('api_rate_limits')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .eq('function_name', functionName)
    .gte('called_at', windowStart)
  if ((count ?? 0) >= limit) return false
  await supabase.from('api_rate_limits').insert({ user_id: userId, function_name: functionName })
  return true
}

// Map Strava sport_type → Vexr workout type
function mapStravaType(sportType: string): string {
  const runTypes = ['Run', 'TrailRun', 'VirtualRun', 'Hike', 'Walk']
  const rideTypes = ['Ride', 'VirtualRide', 'EBikeRide', 'GravelRide', 'MountainBikeRide', 'Handcycle']
  const swimTypes = ['Swim', 'OpenWaterSwim']
  const strengthTypes = [
    'WeightTraining', 'Workout', 'Yoga', 'Pilates', 'Crossfit',
    'Elliptical', 'StairStepper', 'Rowing', 'RockClimbing',
  ]
  if (runTypes.includes(sportType)) return 'run'
  if (rideTypes.includes(sportType)) return 'ride'
  if (swimTypes.includes(sportType)) return 'swim'
  if (strengthTypes.includes(sportType)) return 'strength'
  return 'run'
}

// Calculate TSS from a Strava activity
function estimateTSS(
  activity: Record<string, unknown>,
  type: string,
  ftp: number,
  threshPaceSec: number, // threshold run pace in sec/km
  cssSec: number,        // CSS in sec/100m
): number {
  const movingTime = typeof activity.moving_time === 'number' ? (activity.moving_time as number) : 0
  const durationHrs = movingTime / 3600

  // Ride with power data → real TSS via IF²
  if (type === 'ride' && ftp > 0) {
    const np = typeof activity.weighted_average_watts === 'number'
      ? (activity.weighted_average_watts as number)
      : typeof activity.average_watts === 'number'
        ? (activity.average_watts as number)
        : 0
    if (np > 0) {
      const ifVal = np / ftp
      return Math.round(durationHrs * ifVal * ifVal * 100)
    }
  }

  // Run with distance → pace-based TSS
  if (type === 'run' && threshPaceSec > 0) {
    const distanceM = typeof activity.distance === 'number' ? (activity.distance as number) : 0
    if (distanceM > 0 && movingTime > 0) {
      const avgPaceSec = movingTime / (distanceM / 1000) // sec/km
      const ifVal = threshPaceSec / avgPaceSec // faster than threshold = IF > 1
      return Math.round(durationHrs * ifVal * ifVal * 100)
    }
  }

  // Swim with distance and CSS → CSS-based TSS
  if (type === 'swim' && cssSec > 0) {
    const distanceM = typeof activity.distance === 'number' ? (activity.distance as number) : 0
    if (distanceM > 0 && movingTime > 0) {
      const avgPaceSec = movingTime / (distanceM / 100) // sec/100m
      const ifVal = cssSec / avgPaceSec // faster than CSS = IF > 1
      return Math.round(durationHrs * ifVal * ifVal * 100)
    }
  }

  // Suffer score fallback (Strava Relative Effort — scales similarly to TSS for HR-based effort)
  if (typeof activity.suffer_score === 'number' && activity.suffer_score > 0) {
    return Math.round(activity.suffer_score as number)
  }

  // Last resort: ~50 TSS/hour
  return Math.round(durationHrs * 50)
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const authHeader = req.headers.get('Authorization')
    if (!authHeader?.startsWith('Bearer ')) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } },
    )

    const { data: { user }, error: authError } = await supabase.auth.getUser()
    console.log('[strava-sync] user:', user?.id ?? 'NOT FOUND', authError?.message ?? '')
    if (authError || !user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const allowed = await checkRateLimit(supabase, user.id, 'strava-sync', STRAVA_SYNC_RATE_LIMIT)
    if (!allowed) {
      return new Response(JSON.stringify({ error: 'Rate limit exceeded. Try again in an hour.' }), {
        status: 429,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Fetch the user's Strava connection
    const { data: conn, error: connError } = await supabase
      .from('strava_connections')
      .select('access_token, refresh_token, expires_at, athlete_id')
      .eq('user_id', user.id)
      .single()

    if (connError || !conn) {
      // No connection — nothing to sync
      return new Response(
        JSON.stringify({ count: 0 }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }

    // Refresh token if expiring within 5 minutes
    let accessToken = conn.access_token as string
    const expiresAt = conn.expires_at as number
    const nowSecs = Math.floor(Date.now() / 1000)

    if (expiresAt < nowSecs + 300) {
      const refreshRes = await fetch('https://www.strava.com/oauth/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          client_id: Deno.env.get('STRAVA_CLIENT_ID'),
          client_secret: Deno.env.get('STRAVA_CLIENT_SECRET'),
          refresh_token: conn.refresh_token,
          grant_type: 'refresh_token',
        }),
      })
      const refreshed = await refreshRes.json()
      if (!refreshRes.ok) throw new Error('Token refresh failed')

      accessToken = refreshed.access_token
      await supabase
        .from('strava_connections')
        .update({
          access_token: refreshed.access_token,
          refresh_token: refreshed.refresh_token,
          expires_at: refreshed.expires_at,
        })
        .eq('user_id', user.id)
    }

    // Fetch user's profile for TSS calculation
    const { data: profile } = await supabase
      .from('profiles')
      .select('ftp, run_pace, css')
      .eq('id', user.id)
      .single()

    const ftp = typeof profile?.ftp === 'number' ? profile.ftp : 0
    // run_pace is stored as "m:ss" min/km string e.g. "4:30"
    const runPaceParts = typeof profile?.run_pace === 'string' ? profile.run_pace.split(':') : []
    const threshPaceSec = runPaceParts.length === 2
      ? parseInt(runPaceParts[0]) * 60 + parseInt(runPaceParts[1])
      : 0
    // css is stored as "m:ss" per 100m string e.g. "1:30"
    const cssPaceParts = typeof profile?.css === 'string' ? profile.css.split(':') : []
    const cssSec = cssPaceParts.length === 2
      ? parseInt(cssPaceParts[0]) * 60 + parseInt(cssPaceParts[1])
      : 0

    // Fetch activities from the last 30 days
    const afterSecs = nowSecs - 30 * 24 * 60 * 60
    const activitiesRes = await fetch(
      `https://www.strava.com/api/v3/athlete/activities?after=${afterSecs}&per_page=100`,
      { headers: { Authorization: `Bearer ${accessToken}` } },
    )
    console.log('[strava-sync] Strava activities response status:', activitiesRes.status)
    if (!activitiesRes.ok) throw new Error(`Strava API error: ${activitiesRes.status}`)
    const activities = await activitiesRes.json() as Record<string, unknown>[]
    console.log('[strava-sync] activities fetched:', activities.length)

    if (!activities.length) {
      return new Response(
        JSON.stringify({ count: 0 }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }

    // Find which activity IDs already exist (to deduplicate)
    const stravaIds = activities.map(a => a.id as number)
    const { data: existing } = await supabase
      .from('workouts')
      .select('strava_activity_id')
      .in('strava_activity_id', stravaIds)

    const existingIds = new Set((existing ?? []).map(r => r.strava_activity_id))

    // Build inserts for new activities only
    const inserts = activities
      .filter(a => !existingIds.has(a.id as number))
      .map(a => {
        // Use local date so activity appears on the day the athlete actually did it
        const startDate = typeof a.start_date_local === 'string' ? a.start_date_local
          : typeof a.start_date === 'string' ? a.start_date : ''
        const dateOnly = startDate.split('T')[0] // YYYY-MM-DD

        const hrAvg = typeof a.average_heartrate === 'number' ? Math.round(a.average_heartrate as number) : null
        const hrMax = typeof a.max_heartrate === 'number' ? Math.round(a.max_heartrate as number) : null
        const movingTime = typeof a.moving_time === 'number' ? a.moving_time as number : 0
        const type = mapStravaType((a.sport_type as string) || (a.type as string) || '')

        // Distance
        const distanceM = typeof a.distance === 'number' ? Math.round(a.distance as number) : null

        // Elevation
        const elevGain = typeof a.total_elevation_gain === 'number' ? Math.round(a.total_elevation_gain as number) : null

        // Calories: Strava list endpoint never includes calories, so calculate from available data
        const distanceKm = typeof a.distance === 'number' ? (a.distance as number) / 1000 : 0
        const durationHrsForCal = movingTime / 3600
        const cals = type === 'ride' && typeof a.kilojoules === 'number' && (a.kilojoules as number) > 0
          ? Math.round((a.kilojoules as number) / 4.184 / 0.25)   // mechanical work → kcal via ~25% efficiency
          : type === 'run' && distanceKm > 0
            ? Math.round(distanceKm * 78)                          // 1 kcal/kg/km × 78kg
          : durationHrsForCal > 0
            ? Math.round(durationHrsForCal * 546)                  // MET 7 × 78kg (swims + strength fallback)
          : null

        // Avg power (rides)
        const avgPower = typeof a.average_watts === 'number' ? Math.round(a.average_watts as number) : null

        // Avg pace: runs → min/km, swims → min/100m
        let avgPace: string | null = null
        if (typeof a.average_speed === 'number' && (a.average_speed as number) > 0) {
          if (type === 'run') {
            const secPerKm = 1000 / (a.average_speed as number)
            const paceMin = Math.floor(secPerKm / 60)
            const paceSec = Math.round(secPerKm % 60)
            avgPace = `${paceMin}:${String(paceSec).padStart(2, '0')}`
          } else if (type === 'swim') {
            const secPer100m = 100 / (a.average_speed as number)
            const paceMin = Math.floor(secPer100m / 60)
            const paceSec = Math.round(secPer100m % 60)
            avgPace = `${paceMin}:${String(paceSec).padStart(2, '0')}`
          }
        }

        return {
          user_id: user.id,
          title: (a.name as string) || 'Strava Activity',
          type,
          date: dateOnly,
          duration_minutes: Math.round(movingTime / 60),
          tss: estimateTSS(a, type, ftp, threshPaceSec, cssSec),
          planned: false,
          strava_activity_id: a.id as number,
          heart_rate_avg: hrAvg,
          heart_rate_max: hrMax,
          distance_meters: distanceM,
          elevation_gain: elevGain,
          calories: cals,
          avg_power: avgPower,
          avg_pace: avgPace,
        }
      })

    if (inserts.length === 0) {
      return new Response(
        JSON.stringify({ count: 0 }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }

    console.log('[strava-sync] inserting', inserts.length, 'workouts')
    const { error: insertError } = await supabase.from('workouts').insert(inserts)
    if (insertError) throw insertError
    console.log('[strava-sync] insert success')

    return new Response(
      JSON.stringify({ count: inserts.length }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    )
  } catch (err: unknown) {
    const message = err instanceof Error
      ? err.message
      : (err && typeof err === 'object' ? JSON.stringify(err) : String(err))
    console.error('[strava-sync] error:', message)
    return new Response(
      JSON.stringify({ error: message }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    )
  }
})
