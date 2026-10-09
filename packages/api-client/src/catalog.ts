import { useQuery } from '@tanstack/react-query';
import type { UseQueryResult } from '@tanstack/react-query';
import type { CategoryDTO } from '@pg/types';

import type { ApiClient } from './client';
import { queryKeys } from './query-keys';

/** Query: `GET /categories` (public). */
export function useCategories(client: ApiClient): UseQueryResult<CategoryDTO[], Error> {
  return useQuery({
    queryKey: queryKeys.categories,
    queryFn: () => client.getCategories(),
  });
}
