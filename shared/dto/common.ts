export interface Paginated<T> {
  data: T[];
  page: number;
  pageSize: number;
  total: number;
}
