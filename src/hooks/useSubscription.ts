import { useProfile } from '../contexts/ProfileContext'

export function useSubscription() {
  const { profile } = useProfile()
  const tier = profile?.subscription_tier ?? 'free'
  return {
    tier,
    isPro: tier === 'pro',
  }
}
