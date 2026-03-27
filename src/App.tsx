import { useState } from 'react'
import { ReportScreen } from './components/ReportScreen'
import { TrainerScreen } from './components/TrainerScreen'

type Tab = 'report' | 'trainer'

function App() {
  const [activeTab, setActiveTab] = useState<Tab>('report')

  return (
    <div className="min-h-screen bg-gray-900 text-white">
      {/* Header */}
      <header className="bg-gray-800 border-b border-gray-700 sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="text-xl">♠</span>
            <h1 className="text-lg font-bold text-white">GTO C-bet Trainer</h1>
          </div>
          <nav className="flex gap-1">
            <button
              onClick={() => setActiveTab('report')}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                activeTab === 'report'
                  ? 'bg-blue-600 text-white'
                  : 'text-gray-400 hover:text-white hover:bg-gray-700'
              }`}
              data-testid="tab-report"
            >
              レポート
            </button>
            <button
              onClick={() => setActiveTab('trainer')}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                activeTab === 'trainer'
                  ? 'bg-blue-600 text-white'
                  : 'text-gray-400 hover:text-white hover:bg-gray-700'
              }`}
              data-testid="tab-trainer"
            >
              トレーナー
            </button>
          </nav>
        </div>
      </header>

      {/* Main content */}
      <main className="max-w-7xl mx-auto px-4 py-6">
        {activeTab === 'report' ? <ReportScreen /> : <TrainerScreen />}
      </main>
    </div>
  )
}

export default App
