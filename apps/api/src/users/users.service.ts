import { Injectable } from '@nestjs/common';
import type { UpdateProfileInput } from '@pg/types';

import { PrismaService } from '../prisma/prisma.service';
import type { SessionUser } from '../auth/session.service';

/**
 * Profile updates for the currently-authenticated user. There is
 * deliberately no "update arbitrary user by id" method here — every caller
 * must supply the id of the session user itself (see
 * `UsersController.updateMe`), so this service can never be used to mutate
 * someone else's row.
 */
@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  async updateProfile(userId: string, input: UpdateProfileInput): Promise<SessionUser> {
    return this.prisma.user.update({
      where: { id: userId },
      data: {
        fullName: input.fullName,
        // '' means "clear the optional email" — map it to null rather than
        // persisting an empty string (and failing the DB's implicit
        // uniqueness/format expectations for a real address).
        email: input.email === '' || input.email === undefined ? null : input.email,
        preferredLanguage: input.preferredLanguage,
        addressLine: input.addressLine ?? null,
      },
      include: { roleAssignments: true },
    });
  }
}
