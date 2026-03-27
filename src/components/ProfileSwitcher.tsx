import { PROFILES } from '../utils/profile'
import type { ProfileName } from '../utils/profile'
import { useAppStore } from '../store'

export function ProfileSwitcher() {
  const activeProfile = useAppStore((s) => s.activeProfile)
  const setProfile = useAppStore((s) => s.setProfile)

  return (
    <div className="flex flex-wrap gap-2" data-testid="profile-switcher">
      {PROFILES.map((profile) => (
        <button
          key={profile.name}
          onClick={() => setProfile(profile.name as ProfileName)}
          className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${
            activeProfile === profile.name
              ? 'bg-blue-600 text-white shadow-lg shadow-blue-500/20'
              : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
          }`}
          data-testid={`profile-btn-${profile.name}`}
          title={profile.description}
        >
          {profile.label}
        </button>
      ))}
    </div>
  )
}
