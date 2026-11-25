import type { Customer, CustomerData } from './customer';

export type ContactChanges = Partial<Pick<CustomerData, 'name' | 'email'>>;

export interface CustomerRepository {
  insert(data: CustomerData): Promise<Customer>;
  findById(id: string): Promise<Customer | null>;
  updateContact(id: string, changes: ContactChanges): Promise<boolean>;
}
