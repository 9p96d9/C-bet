interface FrequencyGaugeProps {
  cbetFreq: number
  checkFreq: number
}

export function FrequencyGauge({ cbetFreq, checkFreq }: FrequencyGaugeProps) {
  const safeFreq = Math.min(100, Math.max(0, cbetFreq))

  return (
    <div className="w-full" data-testid="frequency-gauge">
      <div className="flex justify-between text-xs mb-1">
        <span className="text-blue-400">C-bet {cbetFreq}%</span>
        <span className="text-gray-400">Check {checkFreq}%</span>
      </div>
      <div className="w-full h-3 bg-gray-700 rounded-full overflow-hidden">
        <div
          className="h-full bg-gradient-to-r from-blue-500 to-blue-400 rounded-full transition-all duration-300"
          style={{ width: `${safeFreq}%` }}
          data-testid="gauge-bar"
          aria-valuenow={safeFreq}
          aria-valuemin={0}
          aria-valuemax={100}
          role="progressbar"
        />
      </div>
    </div>
  )
}
