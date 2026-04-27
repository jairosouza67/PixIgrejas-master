import React, { useState, useEffect } from 'react';
import { Layout, Logo } from './components/Layout';
import { User, UserRole, Transaction, DashboardStats } from './types';
import { api } from './services/api';
import { supabase } from './services/supabase';
import { initializeDatabase, getChurchIdMap } from './services/database';
import { LucideUpload, LucideFileSpreadsheet, LucideCheckCircle, LucideAlertCircle, LucideLoader2, LucideSearch, LucideDownload, LucideExternalLink, LucideFilter } from 'lucide-react';
import { CHURCH_MAPPING } from './constants';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';

// --- Components ---

const InitializingPage: React.FC = () => {
  return (
    <div className="min-h-screen bg-slate-100 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md overflow-hidden">
        <div className="bg-slate-900 p-8 text-center flex flex-col items-center">
          <Logo className="h-28 w-auto text-white mb-6" />
          <h1 className="text-lg font-bold text-white uppercase tracking-widest mb-1 leading-snug">
            Congregação Cristã<br/>no Brasil
          </h1>
          <div className="w-32 h-0.5 bg-blue-500 my-2 opacity-50"></div>
          <p className="text-blue-200 text-xs uppercase font-bold tracking-wide">
            Administração Vitória da Conquista
          </p>
        </div>
        <div className="p-8 text-center">
          <LucideLoader2 className="animate-spin text-blue-600 mx-auto mb-4" size={32} />
          <h2 className="text-lg font-semibold text-slate-800 mb-2">Inicializando Sistema</h2>
          <p className="text-slate-500 text-sm">Criando estrutura de dados...</p>
        </div>
      </div>
    </div>
  );
};

const LoginPage: React.FC<{ onLogin: (u: User) => void }> = ({ onLogin }) => {
  const [email, setEmail] = useState('admin@ecclesia.com');
  const [password, setPassword] = useState('admin');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      const user = await api.login(email, password);
      onLogin(user);
    } catch (err: any) {
      setError(err?.message || 'Email ou senha incorretos.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-100 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md overflow-hidden">
        <div className="bg-slate-900 p-8 text-center flex flex-col items-center">
          {/* Logo Vetorial */}
          <Logo className="h-28 w-auto text-white mb-6" />
          
          <h1 className="text-lg font-bold text-white uppercase tracking-widest mb-1 leading-snug">
            Congregação Cristã<br/>no Brasil
          </h1>
          <div className="w-32 h-0.5 bg-blue-500 my-2 opacity-50"></div>
          <p className="text-blue-200 text-xs uppercase font-bold tracking-wide">
            Administração Vitória da Conquista
          </p>
        </div>
        <div className="p-8">
          <form onSubmit={handleLogin} className="space-y-6">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Email</label>
              <input 
                type="email" 
                value={email}
                onChange={e => setEmail(e.target.value)}
                className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all"
                required 
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Senha</label>
              <input 
                type="password" 
                value={password}
                onChange={e => setPassword(e.target.value)}
                className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all"
                required 
              />
            </div>
            {error && <div className="p-3 bg-red-50 text-red-600 text-sm rounded-lg flex items-center gap-2"><LucideAlertCircle size={16}/>{error}</div>}
            <button 
              type="submit" 
              disabled={loading}
              className="w-full bg-blue-600 hover:bg-blue-700 text-white font-medium py-2.5 rounded-lg transition-colors flex justify-center items-center"
            >
              {loading ? <LucideLoader2 className="animate-spin" /> : 'Entrar no Sistema'}
            </button>
          </form>
          <div className="mt-6 text-center text-xs text-slate-400">
            <p>Cadastre um usuário no Supabase Auth</p>
            <p>e execute o SQL de setup do banco</p>
          </div>
        </div>
      </div>
    </div>
  );
};

const Dashboard: React.FC = () => {
  const [stats, setStats] = useState<DashboardStats | null>(null);

  useEffect(() => {
    api.getStats().then(setStats);
  }, []);

  if (!stats) return <div className="flex justify-center p-12"><LucideLoader2 className="animate-spin text-blue-600" size={32} /></div>;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-100">
          <p className="text-sm text-slate-500 font-medium">Volume Total</p>
          <h3 className="text-3xl font-bold text-slate-800 mt-2">R$ {stats.totalAmount.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</h3>
          <div className="mt-4 text-xs text-green-600 flex items-center gap-1">
            <LucideCheckCircle size={12} /> Atualizado agora
          </div>
        </div>
        <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-100">
          <p className="text-sm text-slate-500 font-medium">Transações Processadas</p>
          <h3 className="text-3xl font-bold text-slate-800 mt-2">{stats.totalTransactions}</h3>
          <div className="mt-4 text-xs text-blue-600 flex items-center gap-1">
            Desde o início do mês
          </div>
        </div>
        <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-100">
          <p className="text-sm text-slate-500 font-medium">Igrejas Ativas</p>
          <h3 className="text-3xl font-bold text-slate-800 mt-2">66</h3>
          <div className="mt-4 text-xs text-slate-400">
            Total cadastrado
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-100">
          <h4 className="text-lg font-semibold text-slate-800 mb-6">Receita Diária (Últimos 7 dias)</h4>
          {stats.dailyVolume.length > 0 ? (
            <div style={{ width: '100%', height: 280, minWidth: 0 }}>
              <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={200}>
                <BarChart data={stats.dailyVolume}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                  <XAxis dataKey="date" tick={{fontSize: 12}} stroke="#94a3b8" />
                  <YAxis tick={{fontSize: 12}} stroke="#94a3b8" tickFormatter={(v) => `R$${v}`} />
                  <Tooltip formatter={(value: number) => [`R$ ${value.toFixed(2)}`, 'Valor']} cursor={{fill: '#f1f5f9'}} />
                  <Bar dataKey="amount" fill="#3b82f6" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <div className="flex items-center justify-center" style={{ height: 280 }}>
              <p className="text-slate-400 text-sm">Nenhuma transação registrada ainda</p>
            </div>
          )}
        </div>

        <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-100">
          <h4 className="text-lg font-semibold text-slate-800 mb-4">Top 5 Igrejas (Arrecadação)</h4>
          <div className="space-y-4">
            {stats.topChurches.map((church, idx) => (
              <div key={idx} className="flex items-center justify-between p-3 hover:bg-slate-50 rounded-lg transition-colors">
                <div className="flex items-center gap-3">
                  <span className="w-6 h-6 rounded-full bg-slate-100 text-slate-600 flex items-center justify-center text-xs font-bold">{idx + 1}</span>
                  <span className="text-sm font-medium text-slate-700">{church.name}</span>
                </div>
                <span className="text-sm font-bold text-slate-900">R$ {church.amount.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
              </div>
            ))}
            {stats.topChurches.length === 0 && (
              <p className="text-slate-400 text-sm text-center py-4">Nenhuma transação registrada ainda</p>
            )}
          </div>
        </div>
      </div>

      <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-100">
        <h4 className="text-lg font-semibold text-slate-800 mb-4">Gerenciamento de Dados</h4>
        <p className="text-sm text-slate-600 mb-4">
          Limpe a tabela de transações para fazer um novo upload. Isso removerá todos os dados atuais.
        </p>
        <ResetDataButton
          onReset={async () => {
            const newStats = await api.getStats();

            // Fallback de segurança: se vier null/undefined, zera manualmente
            if (!newStats) {
              setStats({
                totalAmount: 0,
                totalTransactions: 0,
                topChurches: [],
                dailyVolume: [],
              });
            } else {
              setStats(newStats);
            }
          }}
        />
      </div>
    </div>
  );
};

const ResetDataButton: React.FC<{ onReset: () => Promise<void> }> = ({ onReset }) => {
  const [loading, setLoading] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  const handleReset = async () => {
    if (!showConfirm) {
      setShowConfirm(true);
      return;
    }

    setLoading(true);
    try {
      const deleted = await api.resetTransactions();
      setShowConfirm(false);
      
      // Wait a moment for database to settle, then refresh stats
      await new Promise(resolve => setTimeout(resolve, 500));
      await onReset();
      
      alert(`✅ ${deleted} transações foram removidas. Você pode fazer um novo upload agora.`);
    } catch (error: any) {
      alert(`❌ Erro ao limpar dados: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  if (showConfirm) {
    return (
      <div className="flex gap-3">
        <button
          onClick={handleReset}
          disabled={loading}
          className="bg-red-600 hover:bg-red-700 text-white px-6 py-2 rounded-lg text-sm font-medium transition-colors disabled:opacity-50 flex items-center gap-2"
        >
          {loading ? <LucideLoader2 className="animate-spin" size={16} /> : <LucideAlertCircle size={16} />}
          {loading ? 'Removendo...' : 'Confirmar Exclusão'}
        </button>
        <button
          onClick={() => setShowConfirm(false)}
          disabled={loading}
          className="bg-slate-300 hover:bg-slate-400 text-slate-800 px-6 py-2 rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
        >
          Cancelar
        </button>
      </div>
    );
  }

  return (
    <button
      onClick={handleReset}
      className="bg-red-100 hover:bg-red-200 text-red-700 px-6 py-2 rounded-lg text-sm font-medium transition-colors flex items-center gap-2"
    >
      <LucideAlertCircle size={16} />
      Limpar Todas as Transações
    </button>
  );
};

const UploadPage: React.FC<{ user: User }> = ({ user }) => {
  const [dragging, setDragging] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [processing, setProcessing] = useState(false);
  const [result, setResult] = useState<{ processed: number; duplicates: number; totalAmount: number } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      setFile(e.dataTransfer.files[0]);
      setError(null);
    }
  };

  const handleUpload = async () => {
    if (!file) return;
    setProcessing(true);
    setError(null);
    try {
      const res = await api.uploadExtract(file, user.id);
      setResult(res);
      setFile(null);
    } catch (e: any) {
      setError(e?.message || "Erro no upload do arquivo");
    } finally {
      setProcessing(false);
    }
  };

  const reset = () => {
    setResult(null);
    setError(null);
    setFile(null);
  }

  return (
    <div className="max-w-2xl mx-auto">
      <div className="bg-white p-8 rounded-xl shadow-sm border border-slate-100">
        <h3 className="text-lg font-bold text-slate-800 mb-2">Importar Extrato Bancário</h3>
        <p className="text-slate-500 text-sm mb-6">Suporta arquivos .OFX, .CSV e .XLSX. O sistema identificará automaticamente a igreja baseada nos centavos.</p>

        {!result ? (
          <>
            <div 
              onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
              onDragLeave={() => setDragging(false)}
              onDrop={handleDrop}
              className={`border-2 border-dashed rounded-xl p-12 flex flex-col items-center justify-center text-center transition-all relative ${dragging ? 'border-blue-500 bg-blue-50' : 'border-slate-300 hover:border-slate-400'}`}
            >
              <div className="w-16 h-16 bg-blue-50 text-blue-600 rounded-full flex items-center justify-center mb-4">
                <LucideUpload size={32} />
              </div>
              <p className="text-slate-900 font-medium mb-1">Arraste seu arquivo aqui</p>
              <p className="text-slate-500 text-xs">ou clique para selecionar do computador</p>
              <input 
                type="file" 
                className="hidden" 
                accept=".csv,.xlsx,.ofx" 
                onChange={(e) => {
                   if (e.target.files?.[0]) {
                     setFile(e.target.files[0]);
                   }
                }}
                id="file-upload"
              />
              <label htmlFor="file-upload" className="absolute inset-0 cursor-pointer" />
            </div>

            {file && (
              <div className="mt-4 p-4 bg-slate-50 rounded-lg flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 bg-blue-100 text-blue-600 rounded flex items-center justify-center">
                    <LucideFileSpreadsheet size={16} />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-slate-800">{file.name}</p>
                    <p className="text-xs text-slate-500">{(file.size / 1024).toFixed(1)} KB</p>
                  </div>
                </div>
                <button onClick={() => setFile(null)} className="text-slate-400 hover:text-red-500 text-xs">Remover</button>
              </div>
            )}

            {error && (
              <div className="mt-4 p-4 bg-red-50 border border-red-200 rounded-lg text-red-600 text-sm flex items-center gap-2">
                <LucideAlertCircle size={18} />
                {error}
              </div>
            )}

            <div className="mt-6 flex justify-end">
               <button 
                onClick={handleUpload}
                disabled={!file || processing}
                className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-2 rounded-lg text-sm font-medium transition-colors disabled:opacity-50 flex items-center gap-2"
               >
                 {processing ? <><LucideLoader2 className="animate-spin" size={16}/> Processando...</> : 'Enviar Arquivo'}
               </button>
            </div>
          </>
        ) : (
          <div className="text-center py-8">
            <div className="w-16 h-16 bg-green-100 text-green-600 rounded-full flex items-center justify-center mx-auto mb-4">
              <LucideCheckCircle size={32} />
            </div>
            <h4 className="text-xl font-bold text-slate-800">Processamento Concluído!</h4>
            <p className="text-slate-500 mt-2">
              <strong className="text-slate-800">{result.processed}</strong> transações foram processadas e associadas às igrejas.<br/>
              {result.duplicates > 0 && <><strong className="text-amber-600">{result.duplicates}</strong> duplicadas foram ignoradas.<br/></>}
              Valor total processado: <strong className="text-slate-800">R$ {result.totalAmount.toFixed(2)}</strong>.
            </p>
            <p className="text-sm text-blue-600 mt-4 bg-blue-50 py-2 px-4 rounded-lg inline-block">
              Os dados foram salvos no banco de dados com sucesso.
            </p>
            <div className="mt-8">
              <button onClick={reset} className="text-slate-600 hover:text-slate-800 font-medium text-sm">Enviar outro arquivo</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

const TransactionList: React.FC<{ user: User }> = ({ user }) => {
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  useEffect(() => {
    api.getTransactions(user.role, user.churchId).then(data => {
      setTransactions(data);
      setLoading(false);
    });
  }, [user]);

  const filtered = transactions.filter(t => 
    t.description.toLowerCase().includes(search.toLowerCase()) || 
    t.amount.toString().includes(search)
  );

  return (
    <div className="bg-white rounded-xl shadow-sm border border-slate-100 overflow-hidden">
      <div className="p-4 border-b border-slate-100 flex flex-col sm:flex-row gap-4 justify-between items-center bg-slate-50/50">
        <h3 className="font-semibold text-slate-800 flex items-center gap-2">
           <LucideFilter size={18} className="text-slate-400" />
           {user.role === UserRole.ADMIN ? 'Todas as Transações' : 'Transações da Congregação'}
        </h3>
        <div className="relative w-full sm:w-64">
          <LucideSearch className="absolute left-3 top-2.5 text-slate-400" size={16} />
          <input 
            type="text" 
            placeholder="Buscar por descrição ou valor..." 
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-4 py-2 border border-slate-300 rounded-lg text-sm focus:ring-1 focus:ring-blue-500 outline-none"
          />
        </div>
      </div>
      
      {loading ? (
        <div className="p-12 flex justify-center"><LucideLoader2 className="animate-spin text-blue-600" /></div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50 text-slate-500 font-medium">
              <tr>
                <th className="px-6 py-3">Data</th>
                <th className="px-6 py-3">Descrição</th>
                <th className="px-6 py-3">Origem (Igreja)</th>
                <th className="px-6 py-3 text-right">Valor</th>
                <th className="px-6 py-3 text-center">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filtered.map((tx) => (
                <tr key={tx.id} className="hover:bg-slate-50 transition-colors">
                  <td className="px-6 py-3 whitespace-nowrap text-slate-600">
                    {new Date(tx.date).toLocaleDateString('pt-BR')}
                  </td>
                  <td className="px-6 py-3 text-slate-800 max-w-xs truncate" title={tx.description}>
                    {tx.description}
                  </td>
                  <td className="px-6 py-3 text-slate-600">
                    <span className="inline-block px-2 py-1 rounded bg-slate-100 text-xs border border-slate-200">
                      {CHURCH_MAPPING[tx.churchId]}
                    </span>
                  </td>
                  <td className="px-6 py-3 text-right font-medium text-slate-900">
                    R$ {tx.amount.toFixed(2)}
                  </td>
                  <td className="px-6 py-3 text-center">
                    {tx.status === 'SYNCED' ? (
                      <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
                        <LucideCheckCircle size={10} /> Sincronizado
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-yellow-100 text-yellow-800">
                        <LucideLoader2 size={10} className="animate-spin" /> Pendente
                      </span>
                    )}
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-6 py-12 text-center text-slate-400">
                    Nenhuma transação encontrada.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

const MySheet: React.FC = () => {
  return (
    <div className="flex flex-col items-center justify-center min-h-[400px] bg-white rounded-xl shadow-sm border border-slate-100 p-8 text-center">
       <div className="w-20 h-20 bg-green-50 text-green-600 rounded-full flex items-center justify-center mb-6">
         <LucideFileSpreadsheet size={40} />
       </div>
       <h2 className="text-2xl font-bold text-slate-800 mb-2">Planilha de Controle</h2>
       <p className="text-slate-500 max-w-md mb-8">
         Acesse a planilha oficial da sua congregação no Google Sheets. Todas as doações identificadas são lançadas automaticamente aqui.
       </p>
       <a 
         href="https://docs.google.com/spreadsheets" 
         target="_blank" 
         rel="noreferrer"
         className="inline-flex items-center gap-2 bg-green-600 hover:bg-green-700 text-white px-8 py-3 rounded-lg font-medium transition-colors shadow-lg shadow-green-200"
       >
         <LucideExternalLink size={18} />
         Abrir Google Sheets
       </a>
    </div>
  )
}

// --- Main App ---

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [currentPath, setCurrentPath] = useState('/login');
  const [isInitializing, setIsInitializing] = useState(true);
  const [initError, setInitError] = useState<string | null>(null);

  useEffect(() => {
    const init = async () => {
      try {
        // Initialize database (create tables if needed)
        await initializeDatabase();
        
        // Check for saved session
        const saved = localStorage.getItem('ccb_user');
        if (saved) {
          const u = JSON.parse(saved);
          setUser(u);
          setCurrentPath(u.role === UserRole.ADMIN ? '/admin/dashboard' : '/me/transactions');
        }
      } catch (error: any) {
        setInitError(error?.message || 'Erro ao inicializar o sistema');
      } finally {
        // Load church ID map after initialization
        try {
          await getChurchIdMap();
        } catch (mapError) {
        }
        setIsInitializing(false);
      }
    };

    init();
  }, []);

  if (isInitializing) {
    return <InitializingPage />;
  }

  if (initError) {
    return (
      <div className="min-h-screen bg-slate-100 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-xl w-full max-w-md overflow-hidden">
          <div className="bg-slate-900 p-8 text-center flex flex-col items-center">
            <Logo className="h-28 w-auto text-white mb-6" />
            <h1 className="text-lg font-bold text-white uppercase tracking-widest mb-1 leading-snug">
              Congregação Cristã<br/>no Brasil
            </h1>
          </div>
          <div className="p-8 text-center">
            <div className="w-16 h-16 bg-red-100 text-red-600 rounded-full flex items-center justify-center mx-auto mb-4">
              <LucideAlertCircle size={32} />
            </div>
            <h2 className="text-lg font-semibold text-slate-800 mb-2">Erro de Inicialização</h2>
            <p className="text-slate-600 text-sm mb-4">{initError}</p>
            <p className="text-slate-500 text-xs mb-4">
              Verifique se:<br/>
              • As credenciais do Supabase estão corretas no .env<br/>
              • Você executou o SQL de setup no dashboard
            </p>
            <button 
              onClick={() => window.location.reload()}
              className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-2 rounded-lg text-sm font-medium transition-colors"
            >
              Tentar Novamente
            </button>
          </div>
        </div>
      </div>
    );
  }

  const handleLogin = (u: User) => {
    setUser(u);
    localStorage.setItem('ccb_user', JSON.stringify(u));
    setCurrentPath(u.role === UserRole.ADMIN ? '/admin/dashboard' : '/me/transactions');
  };

  const handleLogout = async () => {
    try {
      await api.logout();
    } catch (e) {
    }
    setUser(null);
    localStorage.removeItem('ccb_user');
    setCurrentPath('/login');
  };

  if (!user) {
    return <LoginPage onLogin={handleLogin} />;
  }

  const renderContent = () => {
    switch (currentPath) {
      case '/admin/dashboard': return <Dashboard />;
      case '/admin/upload': return <UploadPage user={user} />;
      case '/admin/transactions': return <TransactionList user={user} />;
      case '/me/transactions': return <TransactionList user={user} />;
      case '/me/sheet': return <MySheet />;
      default: return <Dashboard />;
    }
  };

  return (
    <Layout 
      user={user} 
      currentPath={currentPath} 
      onNavigate={setCurrentPath} 
      onLogout={handleLogout}
    >
      {renderContent()}
    </Layout>
  );
}