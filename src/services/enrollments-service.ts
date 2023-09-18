import { Address, Enrollment } from '@prisma/client';
import { request } from '@/utils/request';
import { invalidDataError } from '@/errors';
import { addressRepository, CreateAddressParams, enrollmentRepository, CreateEnrollmentParams } from '@/repositories';
import { exclude } from '@/utils/prisma-utils';
import { CepAdrres } from '@/protocols';

// TODO - Receber o CEP por parâmetro nesta função.



async function getAddressFromCEP(cep: string): Promise<CepAdrres> {
  const result = await validateCep(cep);

  const { logradouro, complemento, bairro, localidade, uf } = result;

  const CepAddress = { logradouro, complemento, bairro, localidade, uf, };
  return CepAddress;
}

async function validateCep(cep: string): Promise<CepAdrres> {
  const validate = /(^\d{8}$)|(^\d{5}[-]\d{3}$)/;
  if (!validate.test(cep)) throw invalidDataError('Cep invalid');

  const result = await request.get(`${process.env.VIA_CEP_API}/${cep}/json/`);
  if (result.data.erro) throw invalidDataError('Cep invalid');
  return result.data;
}

async function getOneWithAddressByUserId(userId: number): Promise<GetOneWithAddressByUserIdResult> {
  const enrollmentWithAddress = await enrollmentRepository.findWithAddressByUserId(userId);

  if (!enrollmentWithAddress) throw invalidDataError('Enrollment invalid');

  const [firstAddress] = enrollmentWithAddress.Address;
  const address = getFirstAddress(firstAddress);

  return {
    ...exclude(enrollmentWithAddress, 'userId', 'createdAt', 'updatedAt', 'Address'),
    ...(!!address && { address }),
  };
}

type GetOneWithAddressByUserIdResult = Omit<Enrollment, 'userId' | 'createdAt' | 'updatedAt'>;

function getFirstAddress(firstAddress: Address): GetAddressResult {
  if (!firstAddress) return null;

  return exclude(firstAddress, 'createdAt', 'updatedAt', 'enrollmentId');
}

type GetAddressResult = Omit<Address, 'createdAt' | 'updatedAt' | 'enrollmentId'>;

async function createOrUpdateEnrollmentWithAddress(params: CreateOrUpdateEnrollmentWithAddress) {
  const enrollment = exclude(params, 'address');
  enrollment.birthday = new Date(enrollment.birthday);
  const address = getAddressForUpsert(params.address);

  await validateCep(params.address.cep);

  const newEnrollment = await enrollmentRepository.upsert(params.userId, enrollment, exclude(enrollment, 'userId'));

  await addressRepository.upsert(newEnrollment.id, address, address);
}

function getAddressForUpsert(address: CreateAddressParams) {
  return {
    ...address,
    ...(address?.addressDetail && { addressDetail: address.addressDetail }),
  };
}

export type CreateOrUpdateEnrollmentWithAddress = CreateEnrollmentParams & {
  address: CreateAddressParams;
};

export const enrollmentsService = {
  getOneWithAddressByUserId,
  createOrUpdateEnrollmentWithAddress,
  getAddressFromCEP,
};
