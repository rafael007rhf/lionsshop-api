import { BusinessError } from '../../../shared/business-error';
import { Customer } from '../domain/customer';
import type { CustomerRepository } from '../domain/customer-repository';

export class RegisterCustomer {
  constructor(private readonly customers: CustomerRepository) {}

  execute(name: unknown, email: unknown, vip: unknown) {
    return this.customers.insert(Customer.forRegistration(name, email, vip));
  }
}

export class GetCustomer {
  constructor(private readonly customers: Pick<CustomerRepository, 'findById'>) {}

  async execute(id: string) {
    const customer = await this.customers.findById(id);
    if (!customer) throw new BusinessError('not-found', 'Cliente não encontrado');
    return customer;
  }
}

export class UpdateCustomer {
  constructor(private readonly customers: CustomerRepository) {}

  async execute(id: string, name: unknown, email: unknown) {
    const updated = await this.customers.updateContact(id, Customer.contactChanges(name, email));
    if (!updated) throw new BusinessError('not-found', 'Cliente não encontrado');
  }
}
