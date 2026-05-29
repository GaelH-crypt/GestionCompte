import client from './client'
import type {
  BankAccountLinked,
  BankInstitution,
  BankRequisitionItem,
  CreateRequisitionResponse,
  SyncLogItem,
} from '@/types'

export const bankSyncApi = {
  listInstitutions: (country = 'FR') =>
    client.get<BankInstitution[]>(`/bank-sync/institutions/?country=${country}`),

  listRequisitions: () =>
    client.get<BankRequisitionItem[]>('/bank-sync/requisitions/'),

  createRequisition: (data: { institution_id: string; institution_name: string; institution_logo: string }) =>
    client.post<CreateRequisitionResponse>('/bank-sync/requisitions/', data),

  deleteRequisition: (id: number) =>
    client.delete(`/bank-sync/requisitions/${id}/`),

  callbackRequisition: (ref: string) =>
    client.post<{ requisition: BankRequisitionItem; bank_accounts_created: number }>(
      '/bank-sync/requisitions/callback/',
      { ref }
    ),

  listBankAccounts: () =>
    client.get<BankAccountLinked[]>('/bank-sync/accounts/'),

  updateBankAccount: (id: number, data: { linked_account: number | null }) =>
    client.patch<BankAccountLinked>(`/bank-sync/accounts/${id}/`, data),

  syncBankAccount: (id: number, linkedAccountId?: number) =>
    client.post<{ transactions_added: number }>(`/bank-sync/accounts/${id}/sync/`, {
      ...(linkedAccountId !== undefined && { linked_account_id: linkedAccountId }),
    }),

  getSyncLogs: (id: number) =>
    client.get<SyncLogItem[]>(`/bank-sync/accounts/${id}/sync-logs/`),
}
