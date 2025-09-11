import { NextRequest, NextResponse } from "next/server";
import { accessPool, executeWithRetry } from "@/lib/mysql";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { getCurrentUTCISO } from "@/app/helpers/dateUtils";

// Função auxiliar para buscar valor do procedimento com desconto do convênio
async function buscarValorProcedimento(procedimentoId: number, tipoCliente: string, convenioId: number) {
  try {
    const [valorRows] = await accessPool.execute(
      `SELECT vp.valor, c.desconto as convenio_desconto
       FROM valor_procedimentos vp
       INNER JOIN tabela_faturamentos tf ON vp.tabela_faturamento_id = tf.id
       INNER JOIN convenios c ON tf.id = c.tabela_faturamento_id
       WHERE vp.procedimento_id = ? AND vp.tipo = ? AND c.id = ?
       LIMIT 1`,
      [procedimentoId, tipoCliente, convenioId]
    );
    
    if ((valorRows as Array<{ valor: number; convenio_desconto: number }>).length > 0) {
      const resultado = (valorRows as Array<{ valor: number; convenio_desconto: number }>)[0];
      const valorOriginal = resultado.valor;
      const descontoConvenio = resultado.convenio_desconto || 0;
      
      // Aplicar desconto se houver
      let valorFinal = valorOriginal;
      if (descontoConvenio > 0) {
        valorFinal = valorOriginal - (valorOriginal * descontoConvenio / 100);
        console.log('💰 [VALOR] Aplicando desconto:', {
          valorOriginal,
          descontoConvenio: `${descontoConvenio}%`,
          valorFinal
        });
      }
      
      return valorFinal;
    }
    return null;
  } catch (error) {
    console.error('❌ Erro ao buscar valor do procedimento:', error);
    return null;
  }
}

// Função auxiliar para criar lançamento
async function criarLancamento(agendaId: number, clienteId: number, procedimentoId: number | null, tipoCliente: string, convenioId: number, usuarioId: string) {
  try {
    // Buscar nome do cliente
    let clienteNome = 'Cliente não informado';
    if (clienteId) {
      const [clienteRows] = await accessPool.execute(
        'SELECT nome FROM clientes WHERE id = ?',
        [clienteId]
      );
      if ((clienteRows as Array<{ nome: string }>).length > 0) {
        clienteNome = (clienteRows as Array<{ nome: string }>)[0].nome;
      }
    }

    // Buscar nome do procedimento
    let procedimentoNome = 'Procedimento não informado';
    if (procedimentoId) {
      const [procedimentoRows] = await accessPool.execute(
        'SELECT nome FROM procedimentos WHERE id = ?',
        [procedimentoId]
      );
      if ((procedimentoRows as Array<{ nome: string }>).length > 0) {
        procedimentoNome = (procedimentoRows as Array<{ nome: string }>)[0].nome;
      }
    }

    // Buscar valor do procedimento
    const valorProcedimento = procedimentoId 
      ? await buscarValorProcedimento(procedimentoId, tipoCliente, convenioId)
      : null;

    // Buscar caixa ativa
    const [caixaRows] = await accessPool.execute(
      'SELECT id FROM caixas WHERE status = "Ativo" LIMIT 1'
    );
    let caixaId = 1;
    if ((caixaRows as Array<{ id: number }>).length > 0) {
      caixaId = (caixaRows as Array<{ id: number }>)[0].id;
    }

    // Buscar plano de conta ativo
    const [planoContaRows] = await accessPool.execute(
      'SELECT id FROM plano_contas WHERE status = "Ativo" LIMIT 1'
    );
    let planoContaId = 1;
    if ((planoContaRows as Array<{ id: number }>).length > 0) {
      planoContaId = (planoContaRows as Array<{ id: number }>)[0].id;
    }

    const descricao = `Agendamento - ${clienteNome} - ${procedimentoNome}`;
    const dataAtual = getCurrentUTCISO();
    console.log('Chegou')
    // Criar lançamento
    await executeWithRetry(accessPool,
      `INSERT INTO lancamentos (
        valor, descricao, data_lancamento, tipo, forma_pagamento,
        status_pagamento, cliente_id, plano_conta_id, caixa_id,
        agenda_id, usuario_id, status
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        valorProcedimento, // valor real do procedimento
        descricao,
        dataAtual,
        'ENTRADA',
        null, // forma_pagamento como null
        'PENDENTE', // status_pagamento PENDENTE
        clienteId,
        planoContaId,
        caixaId,
        agendaId,
        usuarioId, // usuário autenticado
        'Ativo'
      ]
    );

    console.log('✅ [LANCAMENTO] Criado com sucesso para agenda:', agendaId);
    return true;
  } catch (error) {
    console.error('❌ [LANCAMENTO] Erro ao criar:', error);
    return false;
  }
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const rows = await executeWithRetry(accessPool,
      'SELECT id, dtagenda, situacao, cliente_id, convenio_id, procedimento_id, expediente_id, prestador_id, unidade_id, especialidade_id, tipo, created_at, updated_at FROM agendas WHERE id = ?',
      [id]
    );
    if ((rows as Array<{
      id: number;
      dtagenda: string;
      situacao: string;
      cliente_id: number;
      convenio_id: number;
      procedimento_id: number;
      expediente_id: number | null;
      prestador_id: number;
      unidade_id: number;
      especialidade_id: number;
      tipo: string;
      created_at: Date;
      updated_at: Date;
    }>).length === 0) {
      return NextResponse.json(
        { error: 'Agenda não encontrada' },
        { status: 404 }
      );
    }
    const agenda = (rows as Array<{
      id: number;
      dtagenda: string;
      situacao: string;
      cliente_id: number;
      convenio_id: number;
      procedimento_id: number;
      expediente_id: number | null;
      prestador_id: number;
      unidade_id: number;
      especialidade_id: number;
      tipo: string;
      created_at: Date;
      updated_at: Date;
    }>)[0];
    return NextResponse.json(agenda);
  } catch (error) {
    console.error('❌ [AGENDA GET BY ID] Erro ao buscar agenda:', error);
    console.error('❌ [AGENDA GET BY ID] Stack trace:', (error as Error).stack);
    return NextResponse.json(
      { error: 'Erro interno do servidor' },
      { status: 500 }
    );
  }
}
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();
    
    console.log('🔄 [AGENDA PATCH] ID:', id);
    console.log('🔄 [AGENDA PATCH] Body:', body);
    console.log('🔄 [AGENDA PATCH] Nova situação:', body.situacao);
    
    // Obter usuário autenticado
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      console.log('❌ [AGENDA PATCH] Usuário não autenticado');
      return NextResponse.json(
        { error: 'Usuário não autenticado' },
        { status: 401 }
      );
    }
    
    const usuarioId = session.user.id;
    console.log('👤 [AGENDA PATCH] Usuário autenticado:', usuarioId);
    
    // Verificar se o registro existe e buscar dados completos
    const [existingRows] = await accessPool.execute(
      `SELECT id, situacao, cliente_id, procedimento_id, convenio_id 
       FROM agendas WHERE id = ?`,
      [id]
    );
    
    if ((existingRows as Array<{ 
      id: number; 
      situacao: string; 
      cliente_id: number;
      procedimento_id: number;
      convenio_id: number;
    }>).length === 0) {
      console.log('❌ [AGENDA PATCH] Agenda não encontrada');
      return NextResponse.json(
        { error: 'Agenda não encontrada' },
        { status: 404 }
      );
    }
    
    const agendaExistente = (existingRows as Array<{ 
      id: number; 
      situacao: string; 
      cliente_id: number;
      procedimento_id: number;
      convenio_id: number;
    }>)[0];
    console.log('📊 [AGENDA PATCH] Situação atual no banco:', agendaExistente.situacao);
    
    // Atualizar situação
    await executeWithRetry(accessPool,
      `UPDATE agendas SET situacao = ? WHERE id = ?`,
      [body.situacao, id]
    );
    
    // Se a nova situação é AGENDADO, criar lançamento
    if (body.situacao === 'AGENDADO' && agendaExistente.situacao !== 'AGENDADO') {
      console.log('💰 [AGENDA PATCH] Criando lançamento para situação AGENDADO');
      
      // Buscar tipo do cliente
      const [clienteRows] = await accessPool.execute(
        'SELECT tipo as tipoCliente FROM clientes WHERE id = ?',
        [agendaExistente.cliente_id]
      );
      
      let tipoCliente = 'NSOCIO'; // valor padrão
      if ((clienteRows as Array<{ tipoCliente: string }>).length > 0) {
        tipoCliente = (clienteRows as Array<{ tipoCliente: string }>)[0].tipoCliente;
      }
      
      const lancamentoSucesso = await criarLancamento(
        parseInt(id),
        agendaExistente.cliente_id,
        agendaExistente.procedimento_id,
        tipoCliente,
        agendaExistente.convenio_id,
        usuarioId
      );
      
      if (!lancamentoSucesso) {
        console.log('⚠️ [AGENDA PATCH] Falha ao criar lançamento, mas situação foi atualizada');
      }
    }
    
    // Verificar se a atualização foi bem-sucedida
    const [updatedRows] = await accessPool.execute(
      'SELECT id, situacao FROM agendas WHERE id = ?',
      [id]
    );
    
    const agendaAtualizada = (updatedRows as Array<{ id: number; situacao: string }>)[0];
    console.log('✅ [AGENDA PATCH] Situação após atualização:', agendaAtualizada.situacao);
    
    return NextResponse.json({ 
      success: true,
      message: `Situação alterada para ${body.situacao}`,
      oldSituacao: agendaExistente.situacao,
      newSituacao: agendaAtualizada.situacao,
      lancamentoCriado: body.situacao === 'AGENDADO' && agendaExistente.situacao !== 'AGENDADO'
    });
  } catch (error) {
    console.error('❌ [AGENDA PATCH] Erro:', error);
    return NextResponse.json(
      { error: 'Erro interno do servidor', details: error instanceof Error ? error.message : 'Erro desconhecido' },
      { status: 500 }
    );
  }
}
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();
    
    console.log('📝 [AGENDA PUT] Iniciando atualização de agenda');
    console.log('✅ [AGENDA PUT] Dados validados:', { agendaId: id, situacao: body.situacao });
    
    // Buscar situação atual para comparar
    const agendaAtual = await executeWithRetry(accessPool,
      'SELECT situacao, cliente_id, convenio_id, procedimento_id FROM agendas WHERE id = ?',
      [id]
    );
    
    const agendaAnterior = (agendaAtual as Array<any>)[0];
    const situacaoAnterior = agendaAnterior?.situacao;
    
    // Atualizar a agenda
    console.log('📝 [AGENDA PUT] Parâmetros da query UPDATE:', [
      body.dtagenda, body.situacao, body.cliente_id, body.convenio_id,
      body.procedimento_id, body.expediente_id, body.prestador_id,
      body.unidade_id, body.especialidade_id, body.tipo, id
    ]);
    
    await executeWithRetry(accessPool,
      `UPDATE agendas SET 
        dtagenda = ?, situacao = ?, cliente_id = ?, convenio_id = ?, 
        procedimento_id = ?, expediente_id = ?, prestador_id = ?, 
        unidade_id = ?, especialidade_id = ?, tipo = ?
       WHERE id = ?`,
      [
        body.dtagenda, body.situacao, body.cliente_id, body.convenio_id,
        body.procedimento_id, body.expediente_id, body.prestador_id,
        body.unidade_id, body.especialidade_id, body.tipo, id
      ]
    );
    
    console.log('✅ [AGENDA PUT] Agenda atualizada com sucesso');
    
    // Se a situação mudou para AGENDADO, criar lançamento
    if (body.situacao === 'AGENDADO' && situacaoAnterior !== 'AGENDADO') {
      console.log('💰 [AGENDA PUT] Situação mudou para AGENDADO, criando lançamento...');
      
      try {
        // Buscar tipo do cliente
        let tipoCliente = 'SOCIO';
        if (body.cliente_id) {
          const [clienteRows] = await accessPool.execute(
            'SELECT tipoCliente FROM clientes WHERE id = ?',
            [body.cliente_id]
          );
          if ((clienteRows as Array<{ tipoCliente: string }>).length > 0) {
            tipoCliente = (clienteRows as Array<{ tipoCliente: string }>)[0].tipoCliente;
          }
        }
        
        // Buscar valor do procedimento
        let valorProcedimento: number | null = 0;
        if (body.procedimento_id && body.convenio_id) {
          valorProcedimento = await buscarValorProcedimento(body.procedimento_id, tipoCliente, body.convenio_id);
        }
        
        if (valorProcedimento === null) {
          valorProcedimento = 0;
        }
        
        // Buscar nome do procedimento
        let procedimentoNome = 'Procedimento não informado';
        if (body.procedimento_id) {
          const [procRows] = await accessPool.execute(
            'SELECT nome FROM procedimentos WHERE id = ?',
            [body.procedimento_id]
          );
          if ((procRows as Array<{ nome: string }>).length > 0) {
            procedimentoNome = (procRows as Array<{ nome: string }>)[0].nome;
          }
        }
        
        // Buscar nome do cliente
        let clienteNome = 'Cliente não informado';
        if (body.cliente_id) {
          const [cliRows] = await accessPool.execute(
            'SELECT nome FROM clientes WHERE id = ?',
            [body.cliente_id]
          );
          if ((cliRows as Array<{ nome: string }>).length > 0) {
            clienteNome = (cliRows as Array<{ nome: string }>)[0].nome;
          }
        }
        
        // Criar lançamento
        const descricaoLancamento = `${procedimentoNome} - ${clienteNome}`;
        const dataLancamento = new Date(body.dtagenda).toISOString().split('T')[0];
        
        await executeWithRetry(accessPool,
          `INSERT INTO lancamentos (descricao, valor, tipo, data_lancamento, caixa_id, plano_conta_id, agenda_id)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
          [descricaoLancamento, valorProcedimento, 'ENTRADA', dataLancamento, 1, 1, id]
        );
        
        console.log('✅ [AGENDA PUT] Lançamento criado com sucesso');
      } catch (lancError) {
        console.error('❌ [AGENDA PUT] Erro ao criar lançamento:', lancError);
      }
    }
    
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('❌ [AGENDA PUT] Erro:', error);
    return NextResponse.json(
      { error: 'Erro interno do servidor' },
      { status: 500 }
    );
  }
} 