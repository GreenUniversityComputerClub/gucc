export interface CoverImage {
  url: string;
}

export interface Post {
  id: string;
  coverImage: CoverImage;
  slug: string;
  subtitle: string | null;
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
