import { NextResponse } from 'next/server'
import { customFieldDefDb } from '@/lib/supabase-db'
import { validateBodyOrError } from '@/lib/api-validation'
import { z } from 'zod'

// Cache GET requests for 10 minutes - custom fields rarely change
// POST/PUT/DELETE remain dynamic by default
export const revalidate = 600

// Schema for creating a custom field definition
const CreateCustomFieldSchema = z.object({
    key: z.string().min(1).regex(/^[a-z0-9_]+$/, 'Chave deve conter apenas letras minúsculas, números e underline'),
    label: z.string().min(1),
    type: z.enum(['text', 'number', 'date', 'select']),
    options: z.array(z.string()).optional(),
    entity_type: z.enum(['contact', 'deal']).default('contact'),
})

export async function GET(request: Request) {
    try {
        const { searchParams } = new URL(request.url)
        const entityType = (searchParams.get('entityType') as 'contact' | 'deal') || 'contact'

        const fields = await customFieldDefDb.getAll(entityType)

        return NextResponse.json(fields)
    } catch (error: any) {
        console.error('Failed to fetch custom fields:', error)
        return NextResponse.json(
            { error: 'Falha ao buscar campos personalizados', details: error.message || String(error) },
            { status: 500 }
        )
    }
}

export async function POST(request: Request) {
    try {
        const body = await request.json()

        // Validate
        const validation = validateBodyOrError(CreateCustomFieldSchema, body)
        if (!validation.success) return validation.response

        const field = await customFieldDefDb.create(validation.data)

        return NextResponse.json(field, { status: 201 })
    } catch (error: any) {
        console.error('Failed to create custom field:', error)
        return NextResponse.json(
            { error: 'Falha ao criar campo personalizado', details: error.message || String(error) },
            { status: 500 }
        )
    }
}
