import { useState, useEffect } from 'react';
import { LayoutDashboard, FolderPlus, Box, Loader2, Zap, Cpu, Activity, Plus, Search } from 'lucide-react';
import { BmadPipeline } from './components/BmadPipeline';
import { createPipeline, getProjects } from './api/client';

function App() {
  const [activeTab, setActiveTab] = useState('home');
  const [projects, setProjects] = useState<any[]>([]);
  const [isCreating, setIsCreating] = useState(false);
  const [newProjectDesc, setNewProjectDesc] = useState('');
  const [currentProject, setCurrentProject] = useState<any>(null);

  useEffect(() => {
    getProjects().then(setProjects).catch(console.error);
  }, []);

  const handleCreate = async () => {
    if (!newProjectDesc) return;
    setIsCreating(true);
    try {
      const projectId = 'proj-' + Date.now();
      const state = await createPipeline(projectId, newProjectDesc);
      setCurrentProject(state);
      setActiveTab('detail');
      getProjects().then(setProjects);
    } catch (err) {
      console.error(err);
      alert('Failed to create project');
    } finally {
      setIsCreating(false);
    }
  };

  return (
    <div className="flex h-screen bg-background text-gray-100 font-sans overflow-hidden">
      {/* Background Ambience */}
      <div className="absolute top-0 left-0 w-full h-full pointer-events-none z-0">
        <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-primary/20 rounded-full blur-[120px] animate-pulse-slow" />
        <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-secondary/20 rounded-full blur-[120px] animate-pulse-slow delay-1000" />
      </div>

      {/* Sidebar */}
      <aside className="w-72 border-r border-white/5 flex flex-col glass-panel z-20 m-4 rounded-2xl relative">
        <div className="p-8">
          <h1 className="text-3xl font-bold bg-gradient-to-r from-neon-blue to-neon-purple bg-clip-text text-transparent animate-glow">
            VibeCraft
          </h1>
          <p className="text-xs text-gray-400 mt-2 font-mono tracking-wider">SYSTEM ONLINE v2.0</p>
        </div>

        <nav className="flex-1 px-4 space-y-3">
          <NavItem icon={<LayoutDashboard size={20} />} label="Command Center" active={activeTab === 'home'} onClick={() => setActiveTab('home')} />
          <NavItem icon={<FolderPlus size={20} />} label="New Operation" active={activeTab === 'new'} onClick={() => setActiveTab('new')} />
          <NavItem icon={<Box size={20} />} label="Neural Agents" active={activeTab === 'agents'} onClick={() => setActiveTab('agents')} />
          {currentProject && (
            <div className="mt-8 pt-6 border-t border-white/5">
              <div className="px-4 text-xs font-mono text-gray-500 mb-2 uppercase tracking-widest">Active Process</div>
              <NavItem icon={<Loader2 size={20} className="animate-spin text-neon-blue" />} label="Current Build" active={activeTab === 'detail'} onClick={() => setActiveTab('detail')} />
            </div>
          )}
        </nav>

        <div className="p-6">
          <div className="glass-card p-4 rounded-xl flex items-center gap-3">
            <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse"></div>
            <div className="text-xs text-gray-400">System Nominal</div>
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 overflow-auto p-4 relative z-10 w-full">
        {activeTab === 'home' && (
          <div className="max-w-7xl mx-auto space-y-8 animate-fade-in p-4">
            <header className="flex justify-between items-end pb-6 border-b border-white/5">
              <div>
                <h2 className="text-4xl font-bold text-white mb-2">Dashboard</h2>
                <p className="text-gray-400">Orchestrating AI workflows across the verified network.</p>
              </div>
              <button
                onClick={() => setActiveTab('new')}
                className="bg-primary/20 hover:bg-primary/30 text-neon-blue border border-primary/50 px-6 py-2 rounded-lg font-medium transition-all shadow-[0_0_15px_rgba(99,102,241,0.3)] hover:shadow-[0_0_25px_rgba(99,102,241,0.5)] flex items-center gap-2"
              >
                <Plus size={18} /> Initialize Project
              </button>
            </header>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <Card title="Active Projects" value={projects.length} subtitle="Running Pipelines" icon={<Activity className="text-neon-blue" />} delay="0" />
              <Card title="Agents Deployed" value={(projects.length * 5)} subtitle="Neural Nodes Active" icon={<Cpu className="text-neon-purple" />} delay="100" />
              <Card title="System Load" value="12%" subtitle="Stable" icon={<Zap className="text-neon-pink" />} delay="200" />
            </div>

            <h3 className="text-xl font-semibold mt-10 mb-6 flex items-center gap-2">
              <Search size={20} className="text-gray-500" /> Recent Operations
            </h3>

            <div className="grid grid-cols-1 gap-4">
              {projects.length === 0 ? (
                <div className="text-center py-20 text-gray-500 glass-card rounded-2xl border-dashed border-2 border-white/5">
                  <FolderPlus size={48} className="mx-auto mb-4 text-gray-600 opacity-50" />
                  <p>No active operations found via neural link.</p>
                  <button onClick={() => setActiveTab('new')} className="mt-4 text-primary hover:text-neon-blue transition-colors">Initialize first project</button>
                </div>
              ) : (
                projects.map((p: any, i) => (
                  <div key={p.id} className="p-6 glass-card rounded-xl flex justify-between items-center group cursor-pointer hover:border-primary/50" onClick={() => { setCurrentProject(p); setActiveTab('detail'); }} style={{ animationDelay: `${i * 100}ms` }}>
                    <div className="flex items-center gap-4">
                      <div className="w-10 h-10 rounded-lg bg-surface flex items-center justify-center text-gray-400 group-hover:text-white transition-colors">
                        <Box size={20} />
                      </div>
                      <div>
                        <div className="font-bold text-lg text-white group-hover:text-neon-blue transition-colors">{p.name || p.projectId || p.id}</div>
                        <div className="text-xs text-gray-500 font-mono mt-1">{p.templateId || 'CUSTOM_PIPELINE'}</div>
                      </div>
                    </div>
                    <div className="px-4 py-1.5 rounded-full bg-green-500/10 text-green-400 text-xs border border-green-500/20 font-mono">
                      RUNNING
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        )}

        {activeTab === 'new' && (
          <div className="h-full flex flex-col items-center justify-center animate-fade-in relative z-10">
            <div className="glass-panel p-10 rounded-2xl border border-white/10 w-full max-w-3xl shadow-2xl relative overflow-hidden group">
              <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-neon-blue via-neon-purple to-neon-pink" />

              <h2 className="text-4xl font-bold mb-2 text-white text-center">Initialize New Project</h2>
              <p className="text-gray-400 text-center mb-8">Describe your objective. The neural network will handle the rest.</p>

              <div className="relative">
                <textarea
                  className="w-full h-48 bg-black/40 border border-white/10 rounded-xl p-6 text-lg text-white focus:border-primary/50 focus:ring-1 focus:ring-primary/50 outline-none resize-none transition-all placeholder:text-gray-600 font-light"
                  placeholder="e.g. Create a high-frequency trading bot dashboard with Next.js and WebSockets..."
                  value={newProjectDesc}
                  onChange={(e) => setNewProjectDesc(e.target.value)}
                />
                <div className="absolute bottom-4 right-4 text-xs text-gray-600 font-mono">AI EXPECTED LATENCY: 12ms</div>
              </div>

              <div className="mt-8 flex justify-center gap-4">
                <button
                  onClick={() => setActiveTab('home')}
                  className="px-8 py-3 rounded-xl text-gray-400 hover:text-white hover:bg-white/5 transition-colors"
                >
                  Abort
                </button>
                <button
                  onClick={handleCreate}
                  disabled={isCreating || !newProjectDesc}
                  className="bg-primary hover:bg-primary/80 disabled:opacity-50 disabled:cursor-not-allowed text-white px-10 py-3 rounded-xl font-bold tracking-wide transition-all shadow-[0_0_20px_rgba(99,102,241,0.4)] hover:shadow-[0_0_30px_rgba(99,102,241,0.6)] flex items-center gap-2 transform hover:scale-105"
                >
                  {isCreating ? <Loader2 className="animate-spin" size={20} /> : <Zap size={20} />}
                  EXECUTE PIPELINE
                </button>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'detail' && currentProject && (
          <div className="animate-fade-in max-w-7xl mx-auto p-4 space-y-8">
            <div className="flex items-center gap-4">
              <button onClick={() => setActiveTab('home')} className="p-2 rounded-lg hover:bg-white/5 text-gray-400 hover:text-white transition-colors">← Back</button>
              <div>
                <h2 className="text-3xl font-bold text-white tracking-tight">{currentProject.projectId}</h2>
                <div className={`text-sm font-mono mt-1 ${currentProject.currentPhase === 'FAILED' ? 'text-red-500' : 'text-neon-blue'}`}>
                  Status: {currentProject.currentPhase}
                </div>
              </div>
            </div>

            {/* ERROR DISPLAY */}
            {currentProject.templateId === 'error' && (
              <div className="p-6 bg-red-500/10 border border-red-500/50 rounded-2xl animate-pulse">
                <h3 className="text-xl font-bold text-red-500 mb-2">🛑 System Error</h3>
                <p className="text-white font-mono whitespace-pre-wrap">{currentProject.description}</p>
              </div>
            )}

            {currentProject.templateId !== 'error' && (
              <>
                <div className="glass-panel rounded-2xl p-8 border-t border-white/10 relative overflow-hidden">
                  <div className="absolute top-0 right-0 p-4 opacity-10">
                    <Cpu size={200} />
                  </div>
                  <div className="mb-6">
                    <h3 className="text-gray-400 text-xs uppercase tracking-widest mb-1">Objective</h3>
                    <p className="text-gray-200 text-lg">{currentProject.description}</p>
                  </div>
                  <BmadPipeline currentPhase={currentProject.currentPhase} />
                </div>
              </>
            )}

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <div className="glass-panel p-6 rounded-2xl border border-white/5 h-[500px] flex flex-col">
                <h3 className="text-lg font-semibold mb-4 text-gray-200 flex items-center gap-2">
                  <div className="w-2 h-2 bg-neon-blue rounded-full animate-pulse"></div> Agent Terminal
                </h3>
                <div className="flex-1 bg-black/50 rounded-xl p-4 font-mono text-xs text-green-400/80 overflow-auto space-y-2 border border-white/5 shadow-inner">
                  <div className="opacity-50 border-b border-white/5 pb-2 mb-2">System initialized. Connection established using secure 256-bit encryption.</div>
                  <div>[System] Pipeline started for {currentProject.projectId}...</div>
                  <div>[Analyst] <span className="text-blue-400"> Analyzing requirements...</span></div>
                  {currentProject.currentPhase !== 'IDLE' && <div>[Analyst] Analysis complete. 14 user stories identified.</div>}
                  {currentProject.currentPhase === 'PLANNING' && <div>[PM] Generating PRD...</div>}
                  {currentProject.artifacts?.prd && <div>[PM] <span className="text-yellow-400">PRD Generated successfully.</span></div>}
                  {currentProject.currentPhase === 'ARCHITECTURE' && <div>[Architect] Designing system topology...</div>}
                  {(currentProject.currentPhase === 'DEVELOPMENT' || currentProject.currentPhase === 'COMPLETED') && (
                    <>
                      <div>[Dev] Generating code structure...</div>
                      <div>[Dev] <span className="text-neon-pink">File generation complete.</span></div>
                      <div>[GitHub] Pushed to remote repository.</div>
                    </>
                  )}
                  {currentProject.currentPhase === 'COMPLETED' && (
                    <div className="pt-4 text-center">
                      <span className="bg-green-500/20 text-green-400 px-2 py-1 rounded border border-green-500/30">Deployment Successful</span>
                    </div>
                  )}
                </div>
              </div>

              <div className="glass-panel p-6 rounded-2xl border border-white/5 h-[500px] overflow-auto">
                <h3 className="text-lg font-semibold mb-4 text-gray-200">Generated Artifacts</h3>
                <div className="space-y-3">
                  {currentProject.artifacts?.analysis && (
                    <ArtifactCard title="Analysis Report" desc="Requirements & Constraints" type="pdf" />
                  )}
                  {currentProject.artifacts?.prd && (
                    <ArtifactCard title="Product Requirements" desc="User Stories & Specs" type="doc" />
                  )}
                  {currentProject.artifacts?.architecture && (
                    <ArtifactCard title="System Architecture" desc="Tech Stack & Diagram" type="code" />
                  )}
                  {currentProject.artifacts?.github && (
                    <div className="p-4 bg-gray-900/50 rounded-xl border border-white/10 group cursor-pointer hover:border-neon-purple/50 transition-all">
                      <div className="flex justify-between items-start">
                        <div className="font-medium text-sm text-gray-200 group-hover:text-neon-purple transition-colors">GitHub Repository</div>
                        <div className="text-xs px-2 py-0.5 rounded bg-gray-800 text-gray-400">LINK</div>
                      </div>
                      <div className="text-xs text-gray-400 mt-2 font-mono truncate">{currentProject.artifacts.github.url}</div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

function NavItem({ icon, label, active, onClick }: any) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-3 px-4 py-3 w-full text-left rounded-xl transition-all duration-300 group ${active
        ? 'bg-primary/10 text-white border border-primary/20 shadow-[0_0_15px_rgba(99,102,241,0.1)]'
        : 'text-gray-400 hover:bg-white/5 hover:text-gray-100'
        }`}
    >
      <span className={`transition-transform duration-300 ${active ? 'scale-110 text-neon-blue' : 'group-hover:text-white'}`}>{icon}</span>
      <span className="font-medium tracking-wide">{label}</span>
      {active && <div className="ml-auto w-1.5 h-1.5 rounded-full bg-neon-blue shadow-[0_0_5px_#00f3ff]"></div>}
    </button>
  );
}

function Card({ title, value, subtitle, icon, delay }: any) {
  return (
    <div className="p-6 rounded-2xl glass-card relative overflow-hidden group animate-slide-up" style={{ animationDelay: `${delay}ms` }}>
      <div className="absolute top-0 right-0 p-4 opacity-50 group-hover:scale-110 transition-transform duration-500">{icon}</div>
      <h3 className="text-gray-500 text-xs font-mono uppercase tracking-widest mb-2">{title}</h3>
      <div className="text-4xl font-bold text-white mb-2 group-hover:text-glow transition-all">{value}</div>
      <div className="text-sm text-gray-400 group-hover:text-gray-300 transition-colors">{subtitle}</div>
    </div>
  )
}

function ArtifactCard({ title, desc }: any) {
  return (
    <div className="p-4 bg-white/5 rounded-xl border border-white/5 hover:bg-white/10 transition-colors cursor-pointer flex items-center justify-between group">
      <div>
        <div className="font-medium text-sm text-gray-200 group-hover:text-white">{title}</div>
        <div className="text-xs text-gray-500 mt-1">{desc}</div>
      </div>
      <div className="w-8 h-8 rounded-full bg-black/40 flex items-center justify-center text-gray-500 group-hover:text-neon-blue transition-colors">
        <Box size={14} />
      </div>
    </div>
  )
}

export default App;
