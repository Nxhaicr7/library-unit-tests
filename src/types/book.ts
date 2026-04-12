import { PaginationResponse } from '@/types/api';
import { Prisma } from '@prisma/client';

// Type for RRF algorithm
export type BookWithId = { id: number; [key: string]: unknown };

// Book select fields for Prisma queries
export const bookSelectFields = {
  id: true,
  authorId: true,
  title: true,
  isbn: true,
  publishYear: true,
  publisher: true,
  pageCount: true,
  price: true,
  edition: true,
  description: true,
  coverImageUrl: true,
  language: true,
  isDeleted: true,
  createdAt: true,
  updatedAt: true,
  author: {
    select: {
      id: true,
      fullName: true,
    },
  },
  bookCategories: {
    select: {
      category: {
        select: {
          name: true,
        },
      },
    },
  },
  bookEditions: {
    select: {
      format: true,
      id: true,
    },
  },
  _count: {
    select: {
      bookItems: true,
    },
  },
  reviews: {
    where: {
      isDeleted: false,
    },
    select: {
      rating: true,
    },
  },
} satisfies Prisma.BookSelect;

// Raw book data from Prisma query
export type BookRawData = BookWithAuthor & {
  bookCategories?: { category: { name: string } }[];
  bookEditions?: { id: number; format: 'EBOOK' | 'AUDIO' }[];
  _count?: { bookItems: number };
  reviews?: { rating: number }[];
};

// Vector search result
export interface VectorSearchResult {
  bookId: number;
  score: number;
}

// Book filter parameters for search/list
export interface BookFilterParams {
  search?: string;
  authorIds: number[];
  categoryIds: number[];
  languageCodes: string[];
  publishYearFrom?: number;
  publishYearTo?: number;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
  isDeleted?: boolean | null;
  availableAt?: ('book-copy' | 'ebook')[];
  page: number;
  limit: number;
}

export interface Book {
  id: number;
  authorId: number;
  title: string;
  isbn: string | null;
  publishYear: number | null;
  publisher: string | null;
  pageCount: number | null;
  price: number | null;
  edition: string | null;
  description: string | null;
  coverImageUrl: string | null;
  language: string | null;
  createdAt: Date;
  updatedAt: Date;
  isDeleted: boolean;
}

export interface BookWithAuthor extends Book {
  author: {
    id: number;
    fullName: string;
  };
  categories?: string[];
  bookItemsCount?: number;
  bookEbookCount?: number;
  bookAudioCount?: number;
  averageRating?: number;
}

export interface BookDetail extends BookWithAuthor {
  bookItems: {
    id: number;
    code: string;
    condition: string;
    status: string;
    acquisitionDate: Date | null;
    createdAt: Date;
    updatedAt: Date;
    isDeleted: boolean;
  }[];
  bookCategories: {
    categoryId: number;
  }[];
}

export interface BooksListPayload {
  books: BookWithAuthor[];
  pagination: PaginationResponse;
}

export interface CreateBookData {
  authorId: number | string;
  title: string;
  isbn?: string | null;
  publishYear?: number | string | null;
  publisher?: string | null;
  pageCount?: number | string | null;
  price?: number | string | null;
  edition?: string | null;
  description?: string | null;
  coverImageUrl?: string | null;
  language?: string | null;
  isDeleted?: boolean;
  categories?: number[];
}

export interface UpdateBookData {
  authorId?: number | string;
  title?: string;
  isbn?: string | null;
  publishYear?: number | string | null;
  publisher?: string | null;
  pageCount?: number | string | null;
  price?: number | string | null;
  edition?: string | null;
  description?: string | null;
  coverImageUrl?: string | null;
  language?: string | null;
  isDeleted?: boolean;
  categories?: number[];
}
