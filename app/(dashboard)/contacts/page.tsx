import { Suspense } from 'react'
import { getContactsInitialData } from './actions'
import { ContactsClientWrapper } from './ContactsClientWrapper'
import { ContactsSkeleton } from '@/components/features/contacts/ContactsSkeleton'

// Força renderização dinâmica - contatos com supressão calculada precisam de dados frescos
export const dynamic = 'force-dynamic'
export const revalidate = 0

async function ContactsWithData() {
  const initialData = await getContactsInitialData()
  return <ContactsClientWrapper initialData={initialData} />
}

/**
 * Contacts Page - RSC Híbrido
 */
export default function ContactsPage() {
  return (
    <Suspense fallback={<ContactsSkeleton />}>
      <ContactsWithData />
    </Suspense>
  )
}
