/**
 * Gorse API Service
 *
 * Service for interacting with Gorse Recommender System API.
 * Gorse API runs on port 8080 (configurable via environment variables).
 *
 * API Documentation: https://gorse.io/docs/master/api/user.html
 */

import 'dotenv/config';

// Gorse API configuration
const GORSE_API_HOST = process.env.GORSE_API_HOST || 'localhost';
const GORSE_API_PORT = process.env.GORSE_API_PORT || '8088';
const GORSE_API_URL = process.env.GORSE_API_URL || `http://${GORSE_API_HOST}:${GORSE_API_PORT}`;
const GORSE_API_KEY = process.env.GORSE_SERVER_API_KEY || '';

/**
 * Gorse User interface
 */
export interface GorseUser {
  UserId: string;
  Labels?: string[];
  Comment?: string;
}

/**
 * Gorse User creation/update payload
 */
export interface GorseUserPayload {
  UserId: string;
  Labels?: string[];
  Comment?: string;
}

/**
 * Gorse Feedback interface
 */
export interface GorseFeedback {
  FeedbackType: string;
  UserId: string;
  ItemId: string;
  Timestamp: string; // ISO 8601 format
  Comment?: string;
}

/**
 * Gorse Item interface
 */
export interface GorseItem {
  ItemId: string;
  Timestamp: string; // ISO 8601 format
  Labels?: string[];
  Comment?: string;
  Categories?: string[];
  IsHidden?: boolean;
}

/**
 * Gorse Item creation/update payload
 */
export interface GorseItemPayload {
  ItemId: string;
  Timestamp: string; // ISO 8601 format
  Labels?: string[];
  Comment?: string;
  Categories?: string[];
  IsHidden?: boolean;
}

/**
 * Popular item interface from Gorse API
 */
export interface GorsePopularItem {
  Id: string;
  Score: number;
}

/**
 * Latest item interface from Gorse API
 */
export interface GorseLatestItem {
  Id: string;
  Score: number;
}

/**
 * Neighbor item interface from Gorse API
 */
export interface GorseNeighborItem {
  Id: string;
  Score: number;
}

/**
 * Gorse API response wrapper
 */
interface GorseApiResponse<T = unknown> {
  RowAffected?: number;
  data?: T;
}

/**
 * Fetch helper for Gorse API
 */
async function gorseFetch<T = unknown>(endpoint: string, options: RequestInit = {}): Promise<T> {
  const url = `${GORSE_API_URL}${endpoint}`;

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string>),
  };

  // Add API key if configured
  if (GORSE_API_KEY) {
    headers['X-API-Key'] = GORSE_API_KEY;
  }

  const response = await fetch(url, {
    ...options,
    headers,
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Gorse API error (${response.status}): ${errorText || response.statusText}`);
  }

  // Gorse API returns empty body for some endpoints (DELETE, PATCH)
  if (response.status === 204 || response.headers.get('content-length') === '0') {
    return {} as T;
  }

  const data: GorseApiResponse<T> = await response.json();
  return (data.data ?? data) as T;
}

/**
 * Gorse API Service
 */
export class GorseService {
  /**
   * Insert a single user
   * POST /api/user
   */
  static async insertUser(user: GorseUserPayload): Promise<void> {
    await gorseFetch('/api/user', {
      method: 'POST',
      body: JSON.stringify(user),
    });
  }

  /**
   * Get a user by ID
   * GET /api/user/{user-id}
   */
  static async getUser(userId: string): Promise<GorseUser | null> {
    try {
      return await gorseFetch<GorseUser>(`/api/user/${encodeURIComponent(userId)}`);
    } catch (error) {
      if (error instanceof Error && error.message.includes('404')) {
        return null;
      }
      throw error;
    }
  }

  /**
   * Delete a user and their feedback
   * DELETE /api/user/{user-id}
   */
  static async deleteUser(userId: string): Promise<void> {
    await gorseFetch(`/api/user/${encodeURIComponent(userId)}`, {
      method: 'DELETE',
    });
  }

  /**
   * Modify a user
   * PATCH /api/user/{user-id}
   */
  static async updateUser(userId: string, user: Partial<GorseUserPayload>): Promise<void> {
    await gorseFetch(`/api/user/${encodeURIComponent(userId)}`, {
      method: 'PATCH',
      body: JSON.stringify(user),
    });
  }

  /**
   * Get users with pagination
   * GET /api/users?cursor={cursor}&n={n}
   */
  static async getUsers(params?: {
    cursor?: string;
    n?: number;
  }): Promise<{ Users: GorseUser[]; Cursor: string }> {
    const searchParams = new URLSearchParams();
    if (params?.cursor) searchParams.set('cursor', params.cursor);
    if (params?.n) searchParams.set('n', params.n.toString());

    const queryString = searchParams.toString();
    const endpoint = queryString ? `/api/users?${queryString}` : '/api/users';

    return await gorseFetch<{ Users: GorseUser[]; Cursor: string }>(endpoint);
  }

  /**
   * Insert multiple users
   * POST /api/users
   */
  static async insertUsers(users: GorseUserPayload[]): Promise<void> {
    await gorseFetch('/api/users', {
      method: 'POST',
      body: JSON.stringify(users),
    });
  }

  /**
   * Convert library user ID to Gorse user ID format
   * Library uses numeric IDs, Gorse uses string IDs with prefix
   */
  static toGorseUserId(libraryUserId: number): string {
    return `user_${libraryUserId}`;
  }

  /**
   * Extract library user ID from Gorse user ID
   */
  static fromGorseUserId(gorseUserId: string): number | null {
    const match = gorseUserId.match(/^user_(\d+)$/);
    return match ? parseInt(match[1], 10) : null;
  }

  /**
   * Create Gorse user payload from library user data
   */
  static createUserPayload(
    userId: number,
    options?: {
      labels?: string[];
      comment?: string;
    }
  ): GorseUserPayload {
    return {
      UserId: this.toGorseUserId(userId),
      Labels: options?.labels || [],
      Comment: options?.comment || '',
    };
  }

  /**
   * Convert library book ID to Gorse item ID format
   * Library uses numeric IDs, Gorse uses string IDs with prefix
   */
  static toGorseItemId(libraryBookId: number): string {
    return `book_${libraryBookId}`;
  }

  /**
   * Extract library book ID from Gorse item ID
   */
  static fromGorseItemId(gorseItemId: string): number | null {
    const match = gorseItemId.match(/^book_(\d+)$/);
    return match ? parseInt(match[1], 10) : null;
  }

  /**
   * Insert feedback to Gorse
   * POST /api/feedback
   *
   * @param feedback - Array of feedback objects to insert
   */
  static async insertFeedback(feedback: GorseFeedback[]): Promise<void> {
    await gorseFetch('/api/feedback', {
      method: 'POST',
      body: JSON.stringify(feedback),
    });
  }

  /**
   * Create feedback object from library data
   *
   * @param userId - Library user ID
   * @param bookId - Library book ID
   * @param feedbackType - Type of feedback (like, star, comment, borrow, reserve, read)
   * @param comment - Optional comment text
   * @param timestamp - Optional timestamp (defaults to now)
   */
  static createFeedback(
    userId: number,
    bookId: number,
    feedbackType: 'like' | 'star' | 'comment' | 'borrow' | 'reserve' | 'read',
    options?: {
      comment?: string;
      timestamp?: Date;
    }
  ): GorseFeedback {
    return {
      FeedbackType: feedbackType,
      UserId: this.toGorseUserId(userId),
      ItemId: this.toGorseItemId(bookId),
      Timestamp: (options?.timestamp || new Date()).toISOString(),
      Comment: options?.comment || undefined,
    };
  }

  /**
   * Insert a single item to Gorse
   * POST /api/item
   */
  static async insertItem(item: GorseItemPayload): Promise<void> {
    await gorseFetch('/api/item', {
      method: 'POST',
      body: JSON.stringify(item),
    });
  }

  /**
   * Create Gorse item payload from library book data
   *
   * @param book - Book data with author and categories
   * @param options - Optional overrides
   */
  static createItemPayload(
    book: {
      id: number;
      description?: string | null;
      language?: string | null;
      subtitle?: string | null;
      createdAt: Date;
      author?: { fullName: string } | null;
      bookCategories?: Array<{ category: { name: string } }> | null;
    },
    options?: {
      timestamp?: Date;
      isHidden?: boolean;
    }
  ): GorseItemPayload {
    // Extract categories from bookCategories
    const categories = book.bookCategories?.map(bc => bc.category.name).filter(Boolean) || [];

    // Create labels from book metadata (same logic as sync-gorse-data.ts)
    const labels: string[] = [];
    if (book.language) {
      labels.push(book.language);
    }
    if (book.author) {
      labels.push(book.author.fullName);
    }
    if (book.subtitle) {
      labels.push(book.subtitle);
    }

    return {
      ItemId: this.toGorseItemId(book.id),
      Timestamp: (options?.timestamp || book.createdAt).toISOString(),
      Labels: labels.length > 0 ? labels : undefined,
      Comment: book.description || undefined,
      Categories: categories.length > 0 ? categories : undefined,
      IsHidden: options?.isHidden || false,
    };
  }

  /**
   * Get recommended items for a user
   * GET /api/recommend/{user-id}
   *
   * @param userId - Gorse user ID (e.g., "user_1")
   * @param n - Number of recommendations (optional, defaults to 10)
   * @returns Array of recommended item IDs (e.g., ["book_1", "book_8", ...])
   */
  static async getRecommendations(userId: string, n?: number): Promise<string[]> {
    try {
      const searchParams = new URLSearchParams();
      if (n) searchParams.set('n', n.toString());

      const queryString = searchParams.toString();
      const endpoint = queryString
        ? `/api/recommend/${encodeURIComponent(userId)}?${queryString}`
        : `/api/recommend/${encodeURIComponent(userId)}`;

      // Gorse recommendation API returns a direct array, not wrapped in a response object
      const response = await fetch(`${GORSE_API_URL}${endpoint}`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          accept: 'application/json',
          ...(GORSE_API_KEY ? { 'X-API-Key': GORSE_API_KEY } : {}),
        },
      });

      if (!response.ok) {
        if (response.status === 404) {
          return []; // User not found in Gorse, return empty array
        }
        const errorText = await response.text();
        throw new Error(
          `Gorse API error (${response.status}): ${errorText || response.statusText}`
        );
      }

      // Gorse returns a direct array of item IDs
      const itemIds: string[] = await response.json();
      return Array.isArray(itemIds) ? itemIds : [];
    } catch (error) {
      // Log error but return empty array to not break the application
      console.error('Failed to get recommendations from Gorse:', error);
      return [];
    }
  }

  /**
   * Get popular items
   * GET /api/popular
   *
   * @param n - Number of popular items (optional)
   * @param category - Category filter (optional)
   * @returns Array of popular items with Id and Score
   */
  static async getPopularItems(n?: number, category?: string): Promise<GorsePopularItem[]> {
    try {
      const searchParams = new URLSearchParams();
      if (n) searchParams.set('n', n.toString());
      if (category) searchParams.set('category', category);

      const queryString = searchParams.toString();
      const endpoint = queryString
        ? `/api/non-personalized/most_starred?${queryString}`
        : '/api/non-personalized/most_starred';

      const response = await fetch(`${GORSE_API_URL}${endpoint}`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          accept: 'application/json',
          ...(GORSE_API_KEY ? { 'X-API-Key': GORSE_API_KEY } : {}),
        },
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(
          `Gorse API error (${response.status}): ${errorText || response.statusText}`
        );
      }

      // Gorse returns an array of popular items
      const popularItems: GorsePopularItem[] = await response.json();
      return Array.isArray(popularItems) ? popularItems : [];
    } catch (error) {
      // Log error but return empty array to not break the application
      console.error('Failed to get popular items from Gorse:', error);
      return [];
    }
  }

  /**
   * Get latest items
   * GET /api/latest
   *
   * @param n - Number of latest items (optional, defaults to 10)
   * @param offset - Offset for pagination (optional, defaults to 0)
   * @returns Array of latest items with Id and Score
   */
  static async getLatestItems(n?: number, offset?: number): Promise<GorseLatestItem[]> {
    try {
      const searchParams = new URLSearchParams();
      if (n) searchParams.set('n', n.toString());
      if (offset !== undefined) searchParams.set('offset', offset.toString());

      const queryString = searchParams.toString();
      const endpoint = queryString ? `/api/latest?${queryString}` : '/api/latest';

      const response = await fetch(`${GORSE_API_URL}${endpoint}`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          accept: 'application/json',
          ...(GORSE_API_KEY ? { 'X-API-Key': GORSE_API_KEY } : {}),
        },
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(
          `Gorse API error (${response.status}): ${errorText || response.statusText}`
        );
      }

      // Gorse returns an array of latest items
      const latestItems: GorseLatestItem[] = await response.json();
      return Array.isArray(latestItems) ? latestItems : [];
    } catch (error) {
      // Log error but return empty array to not break the application
      console.error('Failed to get latest items from Gorse:', error);
      return [];
    }
  }

  /**
   * Get neighbors of an item (similar items)
   * GET /api/dashboard/item/{item-id}/neighbors
   *
   * @param itemId - Gorse item ID (e.g., "book_1")
   * @param n - Number of neighbors (optional, defaults to 10)
   * @param offset - Offset for pagination (optional, defaults to 0)
   * @returns Array of neighbor items
   */
  static async getItemNeighbors(
    itemId: string,
    n?: number,
    offset?: number
  ): Promise<GorseNeighborItem[]> {
    try {
      const searchParams = new URLSearchParams();
      if (n) searchParams.set('n', n.toString());
      if (offset !== undefined) searchParams.set('offset', offset.toString());

      const queryString = searchParams.toString();
      const endpoint = queryString
        ? `/api/item/${encodeURIComponent(itemId)}/neighbors?${queryString}`
        : `/api/item/${encodeURIComponent(itemId)}/neighbors`;

      const response = await fetch(`${GORSE_API_URL}${endpoint}`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          accept: 'application/json',
          ...(GORSE_API_KEY ? { 'X-API-Key': GORSE_API_KEY } : {}),
        },
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(
          `Gorse API error (${response.status}): ${errorText || response.statusText}`
        );
      }

      // Gorse returns an array of neighbor items
      const neighborItems: GorseNeighborItem[] = await response.json();
      return Array.isArray(neighborItems) ? neighborItems : [];
    } catch (error) {
      // Log error but return empty array to not break the application
      console.error('Failed to get item neighbors from Gorse:', error);
      return [];
    }
  }
}

/**
 * Usage Examples:
 *
 * // Insert a single user
 * await GorseService.insertUser({
 *   UserId: 'user_123',
 *   Labels: ['premium', 'reader'],
 *   Comment: 'John Doe',
 * });
 *
 * // Get a user
 * const user = await GorseService.getUser('user_123');
 *
 * // Update a user
 * await GorseService.updateUser('user_123', {
 *   Labels: ['premium', 'vip'],
 * });
 *
 * // Delete a user
 * await GorseService.deleteUser('user_123');
 *
 * // Get all users with pagination
 * const result = await GorseService.getUsers({ n: 100 });
 * console.log(result.Users); // Array of users
 * console.log(result.Cursor); // Cursor for next page
 *
 * // Insert multiple users
 * await GorseService.insertUsers([
 *   { UserId: 'user_1', Comment: 'User 1' },
 *   { UserId: 'user_2', Comment: 'User 2' },
 * ]);
 *
 * // Integration with library system:
 * // After creating a user in the library system, sync to Gorse:
 * const newUser = await prisma.user.create({ ... });
 * await GorseService.insertUser(
 *   GorseService.createUserPayload(newUser.id, {
 *     comment: newUser.fullName,
 *   })
 * );
 */
