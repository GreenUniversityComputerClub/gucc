export interface CoverImage {
  url: string;
}

export interface Post {
  id: string;
  coverImage?: CoverImage | null;
  slug: string;
  subtitle: string | null;
  category?: string;
  tags?: string[];
  views: number;
  title: string;
  brief: string;
  url: string;
  readTimeInMinutes: number;
  publishedAt?: string;
  updatedAt?: string;
  featuredAt?: string | null;
  content?: {
    markdown: string;
  };
  author: {
    name: string;
    avatarUrl?: string;
    role?: string;
    github?: string;
    url?: string;
  };
}

export interface PostEdge {
  node: Post;
}

export interface PostsResponse {
  data: {
    publication: {
      isTeam: boolean;
      title: string;
      posts: {
        edges: PostEdge[];
      };
    };
  };
}

export interface PostResponse {
  data: {
    publication: {
      post: Post;
    };
  };
}
