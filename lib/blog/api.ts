import { Post, PostsResponse } from '@/app/blog/types';
import { queries } from '.';
import { gqlClient } from './gql';

export async function getAllPosts(): Promise<Post[]> {
  const host = process.env.HASHNODE_HOST || "gucc.hashnode.dev";
  const response = await gqlClient(queries.getPosts(host))();
  const posts = response as PostsResponse;
  const postsData = posts.data.publication.posts.edges;
  return postsData.map((post) => post.node);
}
