import { NextRequest, NextResponse } from "next/server";
import { gestorPool, executeWithRetry } from "@/lib/mysql";
import { z } from "zod";
import { createExpedienteSchema, updateExpedienteSchema } from "./schema/formSchemaExpedientes";

export type CreateExpedienteDTO = z.infer<typeof createExpedienteSchema>;
export type UpdateExpedienteDTO = z.infer<typeof updateExpedienteSchema>;

// GET - Listar expedientes com paginação e busca
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const page = searchParams.get('page') || '1';
    const limit = searchParams.get('limit') || '10';
    const search = searchParams.get('search') || '';
    const alocacao_id = searchParams.get('alocacao_id');

    let query = `
      SELECT 
        e.id,
        e.dtinicio,
        e.dtfinal,
        e.hinicio,
        e.hfinal,
        e.intervalo,
        e.semana,
        e.alocacao_id,
        e.createdAt,
        e.updatedAt,
        a.unidade_id,
        a.especialidade_id,
        a.prestador_id,
        u.nome as unidade_nome,
        esp.nome as especialidade_nome,
        p.nome as prestador_nome
      FROM expedientes e
      LEFT JOIN alocacoes a ON e.alocacao_id = a.id
      LEFT JOIN unidades u ON a.unidade_id = u.id
      LEFT JOIN especialidades esp ON a.especialidade_id = esp.id
      LEFT JOIN prestadores p ON a.prestador_id = p.id
      WHERE 1=1
    `;
    
    // Debug: log da query construída
    console.log("Query construída:", query);
    const params: (string | number)[] = [];

    if (search) {
      query += ' AND (e.dtinicio LIKE ? OR e.dtfinal LIKE ? OR e.semana LIKE ?)';
      params.push(`%${search}%`, `%${search}%`, `%${search}%`);
    }

    if (alocacao_id) {
      query += ' AND e.alocacao_id = ?';
      params.push(parseInt(alocacao_id));
    }

    // Adicionar paginação
    const offset = (parseInt(page) - 1) * parseInt(limit);
    query += ` ORDER BY nome ASC LIMIT ${parseInt(limit)} OFFSET ${offset}`;
    // Parâmetros de paginação inseridos diretamente na query;

    const expedienteRows = await executeWithRetry(gestorPool, query, params);
    
    // Debug: verificar dados retornados
    console.log("🔍 Query executada:", query);
    console.log("🔍 Parâmetros:", params);
    console.log("✅ Expedientes encontrados:", (expedienteRows as Array<{
      id: number;
      dtinicio: string;
      dtfinal: string;
      hinicio: string;
      hfinal: string;
      intervalo: number;
      semana: string;
      alocacao_id: number;
      createdAt: Date;
      updatedAt: Date;
    }>)?.length || 0);
    console.log("🔍 Primeiro expediente:", (expedienteRows as Array<{
      id: number;
      dtinicio: string;
      dtfinal: string;
      hinicio: string;
      hfinal: string;
      intervalo: number;
      semana: string;
      alocacao_id: number;
      createdAt: Date;
      updatedAt: Date;
    }>)?.[0]);

    // Buscar total de registros para paginação
    let countQuery = `
      SELECT COUNT(*) as total 
      FROM expedientes e
      WHERE 1=1
    `;
    const countParams: (string | number)[] = [];

    if (search) {
      countQuery += ' AND (e.dtinicio LIKE ? OR e.dtfinal LIKE ? OR e.semana LIKE ?)';
      countParams.push(`%${search}%`, `%${search}%`, `%${search}%`);
    }

    if (alocacao_id) {
      countQuery += ' AND e.alocacao_id = ?';
      countParams.push(parseInt(alocacao_id));
    }

    const countRows = await executeWithRetry(gestorPool, countQuery, countParams);
    const total = (countRows as Array<{ total: number }>)[0]?.total || 0;
    
    // Debug: verificar contagem
    console.log("🔍 Query de contagem:", countQuery);
    console.log("🔍 Parâmetros de contagem:", countParams);
    console.log("✅ Total de expedientes:", total);

    return NextResponse.json({
      data: expedienteRows,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        totalPages: Math.ceil(total / parseInt(limit))
      }
    });
  } catch (error) {
    console.error('Erro ao buscar expedientes:', error);
    return NextResponse.json(
      { error: 'Erro interno do servidor' },
      { status: 500 }
    );
  }
}

// POST - Criar expediente
export async function POST(request: NextRequest) {
  try {
    const body: CreateExpedienteDTO = await request.json();
    console.log("🔍 Criando expediente:", body);

    // 1. Inserir expediente
    const expedienteResult = await executeWithRetry(gestorPool,
      `INSERT INTO expedientes (
        dtinicio, dtfinal, hinicio, hfinal, intervalo, 
        semana, alocacao_id
      ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        body.dtinicio, body.dtfinal, body.hinicio, body.hfinal,
        body.intervalo, body.semana, body.alocacao_id
      ]
    );

    const expedienteId = (expedienteResult as { insertId: number }).insertId;
    console.log("✅ Expediente criado com ID:", expedienteId);

    // 2. Buscar dados da alocação
    const alocacaoRows = await executeWithRetry(gestorPool,
      `SELECT 
        a.unidade_id,
        a.especialidade_id,
        a.prestador_id
       FROM alocacoes a 
       WHERE a.id = ?`,
      [body.alocacao_id]
    );

    if (!alocacaoRows || (alocacaoRows as Array<{
      unidade_id: number;
      especialidade_id: number;
      prestador_id: number;
    }>).length === 0) {
      throw new Error(`Alocação com ID ${body.alocacao_id} não encontrada`);
    }

    const alocacao = (alocacaoRows as Array<{
      unidade_id: number;
      especialidade_id: number;
      prestador_id: number;
    }>)[0];
    console.log("✅ Dados da alocação:", alocacao);

    // 3. Mapear dias da semana
    const diasDaSemana: Record<string, number> = {
      "Domingo": 0,
      "Segunda": 1,
      "Terça": 2,
      "Quarta": 3,
      "Quinta": 4,
      "Sexta": 5,
      "Sábado": 6
    };

    if (!body.semana || !(body.semana in diasDaSemana)) {
      throw new Error(`Dia da semana inválido: ${body.semana}`);
    }

    const semanaIndex = diasDaSemana[body.semana];
    console.log("✅ Índice da semana:", semanaIndex);

    // 4. Gerar datas válidas
    const dataInicial = new Date(body.dtinicio);
    const dataFinal = new Date(body.dtfinal);

    // Validar se as datas são válidas
    if (isNaN(dataInicial.getTime()) || isNaN(dataFinal.getTime())) {
      return NextResponse.json(
        { error: "Datas inválidas fornecidas" },
        { status: 400 }
      );
    }

    // Gerar datas entre dataInicial e dataFinal
    const datasValidas: Date[] = [];
    const dataAtual = new Date(dataInicial);
    
    while (dataAtual <= dataFinal) {
      datasValidas.push(new Date(dataAtual));
      dataAtual.setDate(dataAtual.getDate() + 1);
    }

    if (datasValidas.length === 0) {
      throw new Error(
        `Não existe nenhuma data correspondente à semana "${body.semana}" entre ${body.dtinicio} e ${body.dtfinal}.`
      );
    }

    console.log("✅ Datas válidas encontradas:", datasValidas.length);

    // 5. Gerar agendamentos
    const agendasToCreate: Array<{
      dtagenda: Date;
      situacao: string;
      expediente_id: number;
      prestador_id: number;
      unidade_id: number;
      especialidade_id: number;
      tipo: string;
    }> = [];
    const intervaloMin = parseInt(body.intervalo, 10);

    for (const data of datasValidas) {
      const [hStart, mStart] = body.hinicio.split(':').map(Number);
      const [hEnd, mEnd] = body.hfinal.split(':').map(Number);

      let startMinutes = hStart * 60 + mStart;
      const endMinutes = hEnd * 60 + mEnd;

      while (startMinutes + intervaloMin <= endMinutes) {
        const hora = Math.floor(startMinutes / 60);
        const minuto = startMinutes % 60;

        const agendaDate = new Date(data);
        agendaDate.setHours(hora, minuto, 0, 0);

        agendasToCreate.push({
          dtagenda: agendaDate,
          situacao: "LIVRE",
          expediente_id: expedienteId,
          prestador_id: alocacao.prestador_id,
          unidade_id: alocacao.unidade_id,
          especialidade_id: alocacao.especialidade_id,
          tipo: "PROCEDIMENTO"
        });

        startMinutes += intervaloMin;
      }
    }

    console.log("✅ Agendamentos a serem criados:", agendasToCreate.length);

    // 6. Inserir agendamentos em lote
    if (agendasToCreate.length > 0) {
      const values = agendasToCreate.map(() => '(?, ?, ?, ?, ?, ?, ?)').join(', ');
      const params = agendasToCreate.flatMap(agenda => [
        agenda.dtagenda,
        agenda.situacao,
        agenda.expediente_id,
        agenda.prestador_id,
        agenda.unidade_id,
        agenda.especialidade_id,
        agenda.tipo
      ]);

      await executeWithRetry(gestorPool,
        `INSERT INTO agendas (
          dtagenda, situacao, expediente_id, prestador_id, 
          unidade_id, especialidade_id, tipo
        ) VALUES ${values}`,
        params
      );

      console.log("✅ Agendamentos criados com sucesso");
    }

    return NextResponse.json({ 
      success: true, 
      expedienteId,
      agendamentosCriados: agendasToCreate.length,
      message: 'Expediente e agendamentos criados com sucesso'
    });
  } catch (error) {
    console.error('❌ Erro ao criar expediente:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Erro interno do servidor' },
      { status: 500 }
    );
  }
}

// PUT - Atualizar expediente
export async function PUT(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');
    
    if (!id) {
      return NextResponse.json(
        { error: 'ID do expediente é obrigatório' },
        { status: 400 }
      );
    }

    const body: UpdateExpedienteDTO = await request.json();

    // Atualizar expediente
    await executeWithRetry(gestorPool,
      `UPDATE expedientes SET 
        dtinicio = ?, dtfinal = ?, hinicio = ?, hfinal = ?,
        intervalo = ?, semana = ?, alocacao_id = ?
       WHERE id = ?`,
      [
        body.dtinicio, body.dtfinal, body.hinicio, body.hfinal,
        body.intervalo, body.semana, body.alocacao_id, id
      ]
    );

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Erro ao atualizar expediente:', error);
    return NextResponse.json(
      { error: 'Erro interno do servidor' },
      { status: 500 }
    );
  }
}

// DELETE - Excluir expediente
export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');
    
    if (!id) {
      return NextResponse.json(
        { error: 'ID do expediente é obrigatório' },
        { status: 400 }
      );
    }

    // Excluir expediente
    await executeWithRetry(gestorPool,
      'DELETE FROM expedientes WHERE id = ?',
      [id]
    );

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Erro ao excluir expediente:', error);
    return NextResponse.json(
      { error: 'Erro interno do servidor' },
      { status: 500 }
    );
  }
} 