import { useState, useEffect } from 'react';
import { LayoutDashboard, FolderPlus, Box, Rocket, Settings, LogOut, Plus, Loader2 } from 'lucide-react';
import { BmadPipeline } from './components/BmadPipeline';
import { createPipeline, getProjects } from './api/client';

function App() {
  const [activeTab, setActiveTab] = useState('home');
  const [projects, setProjects] = useState<any[]>([]);
  const [isCreating, setIsCreating] = useState(false);
  const [newProjectDesc, setNewProjectDesc] = useState('');
  const [currentProject, setCurrentProject] = useState<any>(null);

  useEffect(() => {
    // Load projects on mount
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
      // Refresh list
      getProjects().then(setProjects);
    } catch (err) {
      console.error(err);
      alert('Failed to create project');
    } finally {
      setIsCreating(false);
    }
  };

  return (
    <div className="flex h-screen bg-background text-gray-100 font-sans">
      {/* Sidebar */}
      <aside className="w-64 border-r border-white/10 flex flex-col glass-panel z-20">
        <div className="p-6">
          <h1 className="text-2xl font-bold bg-gradient-to-r from-primary to-secondary bg-clip-text text-transparent">
            VibeCraft
          </h1>
          <p className="text-xs text-gray-400 mt-1">AI Project Orchestrator</p>
        </div>

        <nav className="flex-1 px-4 space-y-2">
          <NavItem icon={<LayoutDashboard size={20} />} label="Home" active={activeTab === 'home'} onClick={() => setActiveTab('home')} />
          <NavItem icon={<FolderPlus size={20} />} label="New Project" active={activeTab === 'new'} onClick={() => setActiveTab('new')} />
          <NavItem icon={<Box size={20} />} label="Agents & Skills" active={activeTab === 'agents'} onClick={() => setActiveTab('agents')} />
          {currentProject && (
            <NavItem icon={<Loader2 size={20} className="animate-spin text-primary" />} label="Current Build" active={activeTab === 'detail'} onClick={() => setActiveTab('detail')} />
          )}
        </nav>
      </aside>

      {/* Main Content */}
      <main className="flex-1 overflow-auto p-8 relative">
        <div className="absolute inset-0 bg-gradient-to-br from-primary/5 to-secondary/5 pointer-events-none" />

        {activeTab === 'home' && (
          <div className="space-y-8 animate-fade-in relative z-10">
            <header className="flex justify-between items-center">
              <div>
                <h2 className="text-3xl font-bold text-white">Welcome back</h2>
                <p className="text-gray-400">Ready to build something amazing today?</p>
              </div>
            </header>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <Card title="Active Projects" value={projects.length} subtitle="Running on Dokploy" />
              <Card title="Agents Deployed" value={(projects.length * 5)} subtitle="Analyst, PM, Dev..." />
              <Card title="System Status" value="Healthy" subtitle="All systems operational" />
            </div>

            <h3 className="text-xl font-semibold mt-8">Recent Projects</h3>
            <div className="grid grid-cols-1 gap-4">
              {projects.length === 0 ? (
                <div className="text-gray-500 italic">No projects yet. Start one!</div>
              ) : (
                projects.map((p: any) => (
                  <div key={p.id} className="p-4 glass-panel rounded-lg border border-white/5 flex justify-between items-center">
                    <div>
                      <div className="font-bold text-lg">{p.name || p.id}</div>
                      <div className="text-sm text-gray-400">{p.templateId}</div>
                    </div>
                    <div className="px-3 py-1 rounded-full bg-green-500/20 text-green-400 text-xs border border-green-500/30">Active</div>
                  </div>
                ))
              )}
            </div>
          </div>
        )}

        {activeTab === 'new' && (
          <div className="max-w-2xl mx-auto animate-fade-in relative z-10 pt-10">
            <h2 className="text-3xl font-bold mb-6">Start a New Project</h2>
            <div className="glass-panel p-8 rounded-xl border border-white/10">
              <label className="block text-sm font-medium text-gray-300 mb-2">Project Description</label>
              <textarea
                className="w-full h-40 bg-black/30 border border-white/10 rounded-lg p-4 text-white focus:ring-2 focus:ring-primary focus:border-transparent outline-none resize-none transition-all"
                placeholder="Describe your app idea in detail... (e.g. A marketplace for vintage sneakers with Supabase auth and Stripe payments)"
                value={newProjectDesc}
                onChange={(e) => setNewProjectDesc(e.target.value)}
              />

              <div className="mt-6 flex justify-end gap-3">
                <button
                  onClick={() => setActiveTab('home')}
                  className="px-6 py-2 rounded-lg text-gray-400 hover:text-white transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleCreate}
                  disabled={isCreating || !newProjectDesc}
                  className="bg-primary hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed text-white px-8 py-2 rounded-lg font-medium transition-all shadow-lg shadow-primary/20 flex items-center gap-2"
                >
                  {isCreating ? <Loader2 className="animate-spin" size={20} /> : <Plus size={20} />}
                  Create Pipeline
                </button>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'detail' && currentProject && (
          <div className="animate-fade-in relative z-10 space-y-6">
            <div className="flex items-center gap-4 mb-8">
              <button onClick={() => setActiveTab('home')} className="text-gray-400 hover:text-white">← Back</button>
              <h2 className="text-2xl font-bold">Project: {currentProject.projectId}</h2>
            </div>

            <BmadPipeline currentPhase={currentProject.currentPhase} />

            <div className="grid grid-cols-2 gap-6 mt-6">
              <div className="glass-panel p-6 rounded-xl border border-white/5 h-96 overflow-auto">
                <h3 className="text-lg font-semibold mb-4 text-secondary">📜 Agent Logs</h3>
                <div className="font-mono text-xs text-gray-400 space-y-2">
                  <div>[System] Pipeline started...</div>
                  <div>[Analyst] Analyze request received.</div>
                  {currentProject.currentPhase !== 'IDLE' && <div>[Analyst] Analysis complete.</div>}
                  {/* In real app, stream logs here */}
                </div>
              </div>
              <div className="glass-panel p-6 rounded-xl border border-white/5 h-96 overflow-auto">
                <h3 className="text-lg font-semibold mb-4 text-green-400">📦 Generated Artifacts</h3>
                <div className="space-y-2">
                  {currentProject.artifacts?.analysis && (
                    <div className="p-3 bg-white/5 rounded border border-white/10">
                      <div className="font-medium text-sm">📄 Analysis Report</div>
                      <div className="text-xs text-gray-400 mt-1">Requirements & Constraints extracted</div>
                    </div>
                  )}
                  {currentProject.artifacts?.prd && (
                    <div className="p-3 bg-white/5 rounded border border-white/10">
                      <div className="font-medium text-sm">📋 PRD</div>
                      <div className="text-xs text-gray-400 mt-1">User stories & features list</div>
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
      className={`flex items-center gap-3 px-4 py-3 w-full text-left rounded-lg transition-all duration-200 ${active
        ? 'bg-primary/10 text-primary border border-primary/20'
        : 'text-gray-400 hover:bg-white/5 hover:text-gray-200'
        }`}
    >
      {icon}
      <span className="font-medium">{label}</span>
    </button>
  );
}

function Card({ title, value, subtitle }: any) {
  return (
    <div className="p-6 rounded-xl glass-panel border border-white/5 hover:border-primary/30 transition-all">
      <h3 className="text-gray-400 text-sm font-medium mb-2">{title}</h3>
      <div className="text-3xl font-bold text-white mb-1">{value}</div>
      <div className="text-sm text-gray-500">{subtitle}</div>
    </div>
  )
}

export default App;
