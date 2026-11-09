import type { PanchayatDTO, WardDTO } from '@pg/types';

/** Prisma Panchayat row -> reference DTO (list/select shape). */
export function toPanchayatDTO(p: {
  id: string;
  code: string;
  name: string;
  nameMl: string;
  status: string;
}): PanchayatDTO {
  return { id: p.id, code: p.code, name: p.name, nameMl: p.nameMl, status: p.status };
}

/** Prisma Ward row -> reference DTO (list/select shape). */
export function toWardDTO(w: {
  id: string;
  number: number;
  name: string;
  nameMl: string;
  panchayatId: string;
  status: string;
}): WardDTO {
  return {
    id: w.id,
    number: w.number,
    name: w.name,
    nameMl: w.nameMl,
    panchayatId: w.panchayatId,
    status: w.status,
  };
}
