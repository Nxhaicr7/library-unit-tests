/**
 * Book Service
 * Utility functions for book operations
 */

import { prisma } from '@/lib/prisma';
import { BookFilterParams, BookRawData, bookSelectFields, BookWithAuthor } from '@/types/book';
import { Prisma } from '@prisma/client';

/**
 * Transform raw book data from Prisma to response format
 *
 * @param booksRaw - Raw book data from Prisma query
 * @returns Transformed book data with computed fields
 */
export function transformBookData(booksRaw: BookRawData[]) {
  return booksRaw.map(b => {
    const ebookCount = b.bookEditions?.filter(e => e.format === 'EBOOK').length ?? 0;
    const audioCount = b.bookEditions?.filter(e => e.format === 'AUDIO').length ?? 0;

    // Calculate rating from reviews
    const reviews = b.reviews || [];
    const averageRating =
      reviews.length > 0
        ? Math.round(
            (reviews.reduce((sum, review) => sum + review.rating, 0) / reviews.length) * 10
          ) / 10
        : 0;

    return {
      ...b,
      categories: b.bookCategories?.map(x => x.category.name) ?? [],
      bookItemsCount: b._count?.bookItems ?? 0,
      bookEbookCount: ebookCount,
      bookAudioCount: audioCount,
      averageRating,
    } as BookWithAuthor;
  });
}

/**
 * Build Prisma where clause from filter params
 */
export function buildBookWhereClause(params: BookFilterParams): Prisma.BookWhereInput {
  const where: Prisma.BookWhereInput = {};

  // Handle isDeleted filter
  if (params.isDeleted === null || params.isDeleted === false) {
    where.isDeleted = false;
  }

  // Handle author filter
  if (params.authorIds.length > 0) {
    where.authorId = { in: params.authorIds };
  }

  // Handle category filter
  if (params.categoryIds.length > 0) {
    where.bookCategories = {
      some: {
        categoryId: { in: params.categoryIds },
      },
    };
  }

  // Handle language filter
  if (params.languageCodes.length > 0) {
    where.language = { in: params.languageCodes };
  }

  // Handle publish year range filter
  if (params.publishYearFrom && params.publishYearFrom > 0) {
    where.publishYear = { gte: params.publishYearFrom };
  }
  if (params.publishYearTo && params.publishYearTo > 0) {
    const existingPublishYear = where.publishYear as Prisma.IntFilter | undefined;
    where.publishYear = {
      ...existingPublishYear,
      lte: params.publishYearTo,
    };
  }

  // Handle availableAt filter
  if (params.availableAt && params.availableAt.length > 0) {
    const hasEbook = params.availableAt.includes('ebook');
    const hasBookCopy = params.availableAt.includes('book-copy');

    if (hasEbook && hasBookCopy) {
      // Show books that have both ebook and book copy available
      const bothConditions: Prisma.BookWhereInput = {
        AND: [
          {
            bookEditions: {
              some: {
                format: 'EBOOK' as const,
                isDeleted: false,
              },
            },
          },
          {
            bookItems: {
              some: {
                status: 'AVAILABLE' as const,
                isDeleted: false,
              },
            },
          },
        ],
      };

      if (where.OR) {
        // Combine search OR with availability AND
        where.AND = [{ OR: where.OR }, bothConditions];
        delete where.OR;
      } else if (where.AND) {
        // Add to existing AND conditions
        const existingAnd = Array.isArray(where.AND) ? where.AND : [where.AND];
        where.AND = [...existingAnd, bothConditions];
      } else {
        // Set as new AND condition
        where.AND = [bothConditions];
      }
    } else if (hasEbook) {
      // Filter books that have ebook editions
      where.bookEditions = {
        some: {
          format: 'EBOOK',
          isDeleted: false,
        },
      };
    } else if (hasBookCopy) {
      // Filter books that have available book items
      where.bookItems = {
        some: {
          status: 'AVAILABLE',
          isDeleted: false,
        },
      };
    }
  }

  return where;
}

/**
 * Build orderBy clause from sort params
 */
export function buildOrderByClause(
  sortBy?: string,
  sortOrder?: 'asc' | 'desc'
): Prisma.BookOrderByWithRelationInput {
  if (!sortBy || !sortOrder) {
    return { createdAt: 'desc' };
  }

  const sortFieldMap: Record<string, string> = {
    id: 'id',
    title: 'title',
    publishYear: 'publishYear',
    pageCount: 'pageCount',
    price: 'price',
    createdAt: 'createdAt',
  };

  const dbField = sortFieldMap[sortBy];
  if (dbField) {
    return { [dbField]: sortOrder };
  }

  return { createdAt: 'desc' };
}

/**
 * List books with pagination and text search
 */
export async function listBooks(
  params: BookFilterParams
): Promise<{ books: BookRawData[]; total: number }> {
  const where = buildBookWhereClause(params);

  // Add text search if provided (fallback mode)
  if (params.search) {
    const searchOR = [
      { title: { contains: params.search } },
      { isbn: { contains: params.search } },
      { publisher: { contains: params.search } },
      { description: { contains: params.search } },
      { author: { fullName: { contains: params.search } } },
    ];

    if (where.AND) {
      const existingAnd = Array.isArray(where.AND) ? where.AND : [where.AND];
      where.AND = [...existingAnd, { OR: searchOR }];
    } else {
      where.OR = searchOR;
    }
  }

  const orderBy = buildOrderByClause(params.sortBy, params.sortOrder);
  const skip = (params.page - 1) * params.limit;

  const [booksRaw, total] = await Promise.all([
    prisma.book.findMany({
      where,
      skip,
      take: params.limit,
      orderBy,
      select: bookSelectFields,
    }),
    prisma.book.count({ where }),
  ]);

  return {
    books: booksRaw as BookRawData[],
    total,
  };
}
