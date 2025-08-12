import { NextRequest, NextResponse } from "next/server";
import { gestorPool } from "@/lib/mysql";

// GET - Buscar cliente por ID
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const id = params.id;

    const [rows] = await gestorPool.execute(
      'SELECT * FROM clientes WHERE id = ? AND status = "Ativo"',
      [id]
    );

    if ((rows as any[]).length === 0) {
      return NextResponse.json(
        { error: 'Cliente não encontrado' },
        { status: 404 }
      );
    }

    const cliente = (rows as any[])[0];

    // Buscar convênios do cliente
    const [conveniosRows] = await gestorPool.execute(
      'SELECT convenio_id, desconto FROM convenios_clientes WHERE cliente_id = ?',
      [id]
    );
    console.log(cliente);
    cliente.convenios = (conveniosRows as any[]).map((row: any) => ({
      convenioId: row.convenio_id,
      desconto: row.desconto
    }));

    return NextResponse.json(cliente);
  } catch (error) {
    console.error('Erro ao buscar cliente:', error);
    return NextResponse.json(
      { error: 'Erro interno do servidor' },
      { status: 500 }
    );
  }
}

// PUT - Atualizar cliente
export async function PUT(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const id = params.id;
    const body = await request.json();

    // Atualizar cliente
    await gestorPool.execute(
      `UPDATE clientes SET 
        nome = ?, email = ?, dtnascimento = ?, sexo = ?, tipo = ?, 
        cpf = ?, cep = ?, logradouro = ?, numero = ?, bairro = ?, 
        cidade = ?, uf = ?, telefone1 = ?, telefone2 = ?
       WHERE id = ?`,
      [
        body.nome, body.email, body.dtnascimento, body.sexo, body.tipo,
        body.cpf, body.cep, body.logradouro, body.numero, body.bairro,
        body.cidade, body.uf, body.telefone1, body.telefone2, id
      ]
    );

    // Remover convênios antigos
    await gestorPool.execute(
      'DELETE FROM convenios_clientes WHERE cliente_id = ?',
      [id]
    );

    // Adicionar novos convênios
    if (body.convenios && body.convenios.length > 0) {
      for (const convenioId of body.convenios) {
        const descontoValue = body.desconto[convenioId];
        const descontoFinal = typeof descontoValue === 'number' && !isNaN(descontoValue) 
          ? descontoValue 
          : 0;

        await gestorPool.execute(
          'INSERT INTO convenios_clientes (convenio_id, cliente_id, desconto) VALUES (?, ?, ?)',
          [convenioId, id, descontoFinal]
        );
      }
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Erro ao atualizar cliente:', error);
    return NextResponse.json(
      { error: 'Erro interno do servidor' },
      { status: 500 }
    );
  }
} 