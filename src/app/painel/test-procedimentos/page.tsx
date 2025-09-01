"use client";

import React, { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Loader2, AlertCircle, CheckCircle, Search } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface Cliente {
  id: number;
  nome: string;
  cpf?: string;
  email?: string;
  tipoCliente: string;
}

interface Convenio {
  id: number;
  nome: string;
  desconto?: number;
}

interface Procedimento {
  id: number;
  nome: string;
  codigo?: string;
}

interface ValorProcedimento {
  id: number;
  procedimento: Procedimento;
  valor: number;
  convenio_id: number;
  tipo_cliente: string;
}

interface TestInfo {
  clientes: Cliente[];
  convenios: Convenio[];
  procedimentos: ValorProcedimento[];
  clienteSelecionado: Cliente | null;
  convenioSelecionado: Convenio | null;
  tipoClienteSelecionado: string;
  loading: boolean;
  error?: string;
}

export default function TestProcedimentos() {
  const [testInfo, setTestInfo] = useState<TestInfo>({
    clientes: [],
    convenios: [],
    procedimentos: [],
    clienteSelecionado: null,
    convenioSelecionado: null,
    tipoClienteSelecionado: "NSOCIO",
    loading: false
  });

  const [searchCliente, setSearchCliente] = useState("");
  const [searchConvenio, setSearchConvenio] = useState("");

  // Debug: monitorar mudanças nos convênios
  useEffect(() => {
    console.log('🔍 Estado dos convênios mudou:', testInfo.convenios);
  }, [testInfo.convenios]);

  // Debug: monitorar mudanças nos procedimentos
  useEffect(() => {
    console.log('🔍 Estado dos procedimentos mudou:', testInfo.procedimentos);
  }, [testInfo.procedimentos]);

  // Carregar clientes ao iniciar
  useEffect(() => {
    fetchClientes();
  }, []);

  const fetchClientes = async () => {
    try {
      setTestInfo(prev => ({ ...prev, loading: true }));
      const response = await fetch("/api/clientes?limit=1000");
      
      if (response.ok) {
        const data = await response.json();
        setTestInfo(prev => ({ 
          ...prev, 
          clientes: data.data || [],
          loading: false 
        }));
      } else {
        throw new Error("Erro ao carregar clientes");
      }
    } catch (error) {
      console.error("Erro ao carregar clientes:", error);
      setTestInfo(prev => ({ 
        ...prev, 
        error: error instanceof Error ? error.message : 'Erro ao carregar clientes',
        loading: false 
      }));
    }
  };

  const fetchConvenios = async (clienteId: number) => {
    try {
      console.log('🔍 Buscando convênios para cliente ID:', clienteId);
      
      const response = await fetch(`/api/convenios-clientes?cliente_id=${clienteId}`);
      console.log('🔍 Resposta da API convenios-clientes:', response.status, response.statusText);
      
      if (response.ok) {
        const data = await response.json();
        console.log('🔍 Dados recebidos da API convenios-clientes:', data);
        
        // Mapear os dados corretamente baseado na estrutura retornada
        let conveniosMapeados = [];
        
        if (data.data && Array.isArray(data.data)) {
          // Mapear baseado na estrutura real retornada pela API
          conveniosMapeados = data.data.map((item: { convenioId: number; nome: string; desconto?: number }) => {
            console.log('🔍 Mapeando item:', item);
            
            // A API retorna: convenioId, nome, desconto
            return {
              id: item.convenioId, // ID do convênio (não do registro da tabela)
              nome: item.nome,      // Nome do convênio
              desconto: item.desconto
            };
          });
        }
        
        console.log('🔍 Convênios mapeados:', conveniosMapeados);
        
        setTestInfo(prev => ({ 
          ...prev, 
          convenios: conveniosMapeados 
        }));
        
        console.log('🔍 Convênios atualizados no estado:', conveniosMapeados);
      } else {
        const errorData = await response.json();
        console.error("❌ Erro ao carregar convênios:", errorData);
        throw new Error("Erro ao carregar convênios");
      }
    } catch (error) {
      console.error("❌ Erro ao carregar convênios:", error);
      setTestInfo(prev => ({ 
        ...prev, 
        convenios: [] 
      }));
    }
  };

  const fetchProcedimentos = async (tipoCliente: string, convenioId: number) => {
    try {
      console.log('🔍 Buscando procedimentos para:', { tipoCliente, convenioId });
      
      const response = await fetch(
        `/api/valor-procedimento?convenio_id=${convenioId}&tipoCliente=${tipoCliente}`
      );
      
      console.log('🔍 Resposta da API valor-procedimento:', response.status, response.statusText);
      
      if (response.ok) {
        const data = await response.json();
        console.log('🔍 Dados recebidos da API valor-procedimento:', data);
        console.log('🔍 Procedimentos encontrados:', data.data?.length || 0);
        
        setTestInfo(prev => ({ 
          ...prev, 
          procedimentos: data || [] 
        }));
        
        console.log('🔍 Procedimentos atualizados no estado:', data || []);
      } else {
        const errorData = await response.json();
        console.error("❌ Erro ao carregar procedimentos:", errorData);
        throw new Error("Erro ao carregar procedimentos");
      }
    } catch (error) {
      console.error("❌ Erro ao carregar procedimentos:", error);
      setTestInfo(prev => ({ 
        ...prev, 
        procedimentos: [] 
      }));
    }
  };

  const handleClienteSelect = (cliente: Cliente) => {
    setTestInfo(prev => ({ 
      ...prev, 
      clienteSelecionado: cliente,
      tipoClienteSelecionado: cliente.tipoCliente || "NSOCIO"
    }));
    fetchConvenios(cliente.id);
  };

  const handleConvenioSelect = (convenio: Convenio) => {
    console.log('🔍 Convênio selecionado:', convenio);
    console.log('🔍 Tipo de cliente atual:', testInfo.tipoClienteSelecionado);
    
    setTestInfo(prev => ({ 
      ...prev, 
      convenioSelecionado: convenio 
    }));
    
    // Buscar procedimentos automaticamente
    if (testInfo.tipoClienteSelecionado) {
      console.log('🔍 Chamando fetchProcedimentos com:', {
        tipoCliente: testInfo.tipoClienteSelecionado,
        convenioId: convenio.id
      });
      fetchProcedimentos(testInfo.tipoClienteSelecionado, convenio.id);
    } else {
      console.log('⚠️ Tipo de cliente não definido, não buscando procedimentos');
    }
  };

  const handleTipoClienteChange = (tipo: string) => {
    setTestInfo(prev => ({ 
      ...prev, 
      tipoClienteSelecionado: tipo 
    }));
    
    // Recarregar procedimentos se já há convênio selecionado
    if (testInfo.convenioSelecionado) {
      fetchProcedimentos(tipo, testInfo.convenioSelecionado.id);
    }
  };

  const testAllProcedimentos = async () => {
    console.log('🧪 Testando todos os procedimentos...');
    
    try {
      // Testar com diferentes combinações
      const tiposCliente = ["SOCIO", "NSOCIO", "PARCEIRO", "FUNCIONARIO"];
      
      for (const tipo of tiposCliente) {
        console.log(`🧪 Testando tipo: ${tipo}`);
        
        // Buscar todos os convênios
        const conveniosResponse = await fetch("/api/convenios?limit=1000");
        if (conveniosResponse.ok) {
          const conveniosData = await conveniosResponse.json();
          
          for (const convenio of conveniosData.data || []) {
            console.log(`🧪 Testando convênio: ${convenio.nome} (ID: ${convenio.id})`);
            
            const procedimentosResponse = await fetch(
              `/api/valor-procedimento?convenio_id=${convenio.id}&tipoCliente=${tipo}`
            );
            
            if (procedimentosResponse.ok) {
              const procedimentosData = await procedimentosResponse.json();
              const count = procedimentosData.data?.length || 0;
              
              if (count > 0) {
                console.log(`✅ Encontrados ${count} procedimentos para ${tipo} + ${convenio.nome}`);
                console.log('📋 Primeiros procedimentos:', procedimentosData.data.slice(0, 3));
              } else {
                console.log(`❌ Nenhum procedimento para ${tipo} + ${convenio.nome}`);
              }
            }
          }
        }
      }
    } catch (error) {
      console.error('❌ Erro no teste:', error);
    }
  };

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold">🧪 Teste de Procedimentos</h1>
        <div className="space-x-2">
          <Button 
            type="button" 
            variant="outline" 
            onClick={() => {
              console.log('🔍 Debug - Estado atual:', {
                clienteSelecionado: testInfo.clienteSelecionado,
                convenios: testInfo.convenios,
                tipoCliente: testInfo.tipoClienteSelecionado
              });
              
              // Testar API de convênios-clientes
              if (testInfo.clienteSelecionado) {
                console.log('🔍 Testando API para cliente:', testInfo.clienteSelecionado.id);
                
                // Testar a API diretamente
                fetch(`/api/convenios-clientes?cliente_id=${testInfo.clienteSelecionado.id}`)
                  .then(res => res.json())
                  .then(data => {
                    console.log('🔍 Resposta direta da API:', data);
                    
                    // Testar o mapeamento
                    if (data.data && Array.isArray(data.data)) {
                      const conveniosMapeados = data.data.map((item: { convenioId?: number; id?: number; nome?: string; convenio_nome?: string; desconto?: number }) => ({
                        id: item.convenioId || item.id || 0,
                        nome: item.nome || item.convenio_nome || '',
                        desconto: item.desconto
                      }));
                      console.log('🔍 Convênios mapeados no debug:', conveniosMapeados);
                    }
                  })
                  .catch(err => console.error('❌ Erro no debug:', err));
                
                // Testar API de debug
                fetch(`/api/debug/convenios-clientes?clienteId=${testInfo.clienteSelecionado.id}`)
                  .then(res => res.json())
                  .then(data => {
                    console.log('🔍 Debug convênios-clientes:', data);
                  })
                  .catch(err => console.error('❌ Erro no debug:', err));
              }
            }}
          >
            🐛 Debug
          </Button>
          <Button onClick={testAllProcedimentos} variant="outline">
            🔍 Testar Todos
          </Button>
          <Button onClick={fetchClientes} disabled={testInfo.loading}>
            {testInfo.loading ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin mr-2" />
                Carregando...
              </>
            ) : (
              '🔄 Recarregar'
            )}
          </Button>
        </div>
      </div>

      {testInfo.error && (
        <Card className="border-red-200 bg-red-50">
          <CardHeader>
            <CardTitle className="flex items-center text-red-700">
              <AlertCircle className="w-5 h-5 mr-2" />
              Erro
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-red-600">{testInfo.error}</p>
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Seleção de Cliente */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center">
              <CheckCircle className="w-5 h-5 mr-2 text-green-600" />
              Cliente ({testInfo.clientes.length})
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="relative">
              <Search className="absolute left-3 top-3 h-4 w-4 text-gray-400" />
              <input
                type="text"
                placeholder="Buscar cliente..."
                value={searchCliente}
                onChange={(e) => setSearchCliente(e.target.value)}
                className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>
            
            <div className="max-h-60 overflow-y-auto space-y-2">
              {testInfo.clientes
                .filter(cliente => 
                  cliente.nome.toLowerCase().includes(searchCliente.toLowerCase()) ||
                  cliente.cpf?.includes(searchCliente) ||
                  cliente.email?.toLowerCase().includes(searchCliente.toLowerCase())
                )
                .slice(0, 10)
                .map((cliente) => (
                  <div
                    key={cliente.id}
                    onClick={() => handleClienteSelect(cliente)}
                    className={`p-3 border rounded-md cursor-pointer transition-colors ${
                      testInfo.clienteSelecionado?.id === cliente.id
                        ? 'border-blue-500 bg-blue-50'
                        : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50'
                    }`}
                  >
                    <div className="font-medium">{cliente.nome}</div>
                    <div className="text-sm text-gray-500">
                      {cliente.cpf && `CPF: ${cliente.cpf}`}
                      {cliente.email && ` | ${cliente.email}`}
                    </div>
                    <div className="text-xs text-blue-600 mt-1">
                      Tipo: {cliente.tipoCliente || 'NSOCIO'}
                    </div>
                  </div>
                ))}
            </div>
          </CardContent>
        </Card>

        {/* Seleção de Convênio */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center">
              <CheckCircle className="w-5 h-5 mr-2 text-blue-600" />
              Convênio ({testInfo.convenios.length})
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="relative">
              <Search className="absolute left-3 top-3 h-4 w-4 text-gray-400" />
              <input
                type="text"
                placeholder="Buscar convênio..."
                value={searchConvenio}
                onChange={(e) => setSearchConvenio(e.target.value)}
                className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                disabled={!testInfo.clienteSelecionado}
              />
            </div>
            
            <div className="max-h-60 overflow-y-auto space-y-2">
              {testInfo.convenios
                .filter(convenio => 
                  convenio.nome.toLowerCase().includes(searchConvenio.toLowerCase())
                )
                .slice(0, 10)
                .map((convenio) => {
                  return (
                    <div
                      key={convenio.id}
                      onClick={() => handleConvenioSelect(convenio)}
                      className={`p-3 border rounded-md cursor-pointer transition-colors ${
                        testInfo.convenioSelecionado?.id === convenio.id
                          ? 'border-blue-500 bg-blue-50'
                          : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50'
                      }`}
                    >
                      <div className="font-medium">{convenio.nome}</div>
                      {convenio.desconto && (
                        <div className="text-xs text-green-600 mt-1">
                          Desconto: {convenio.desconto}%
                        </div>
                      )}
                    </div>
                  );
                })}
            </div>
          </CardContent>
        </Card>

        {/* Tipo de Cliente */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center">
              <CheckCircle className="w-5 h-5 mr-2 text-purple-600" />
              Tipo Cliente
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Select
              value={testInfo.tipoClienteSelecionado}
              onValueChange={handleTipoClienteChange}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="SOCIO">SOCIO</SelectItem>
                <SelectItem value="NSOCIO">NSOCIO</SelectItem>
                <SelectItem value="PARCEIRO">PARCEIRO</SelectItem>
                <SelectItem value="FUNCIONARIO">FUNCIONARIO</SelectItem>
              </SelectContent>
            </Select>
          </CardContent>
        </Card>
      </div>

      {/* Resultados */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center">
            <CheckCircle className="w-5 h-5 mr-2 text-orange-600" />
            Procedimentos Encontrados ({testInfo.procedimentos.length})
          </CardTitle>
        </CardHeader>
        <CardContent>
          {testInfo.procedimentos.length > 0 ? (
            <div className="space-y-3">
              {testInfo.procedimentos.map((proc) => (
                <div key={proc.id} className="p-3 border border-gray-200 rounded-md">
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="font-medium">{proc.procedimento.nome}</div>
                      <div className="text-sm text-gray-500">
                        {proc.procedimento.codigo && `Código: ${proc.procedimento.codigo}`}
                        {proc.valor && ` | Valor: R$ ${Number(proc.valor).toFixed(2)}`}
                      </div>
                    </div>
                    <div className="text-xs text-gray-400">
                      ID: {proc.id}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-8 text-gray-500">
              {!testInfo.clienteSelecionado ? (
                "Selecione um cliente para começar"
              ) : !testInfo.convenioSelecionado ? (
                "Selecione um convênio para continuar"
              ) : (
                "Nenhum procedimento encontrado para esta combinação"
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Informações de Debug */}
      <Card>
        <CardHeader>
          <CardTitle>📋 Informações de Debug</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-2 text-sm">
            <div><strong>Cliente selecionado:</strong> {testInfo.clienteSelecionado?.nome || 'Nenhum'}</div>
            <div><strong>Convênio selecionado:</strong> {testInfo.convenioSelecionado?.nome || 'Nenhum'}</div>
            <div><strong>Tipo de cliente:</strong> {testInfo.tipoClienteSelecionado}</div>
            <div><strong>Total de procedimentos:</strong> {testInfo.procedimentos.length}</div>
          </div>
          <div className="mt-4 p-3 bg-gray-100 rounded text-xs">
            <p><strong>Dica:</strong> Abra o console do navegador (F12) para ver logs detalhados dos testes.</p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

