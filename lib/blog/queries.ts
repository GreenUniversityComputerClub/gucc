const gql = String.raw;
export const subscribeToNewsletter = gql`
  mutation SubscribeToNewsletter($email: String!) {
    subscribeToNewsletter(input: { email: $email, publicationId: "666d4f03c8a425332693a535" }) {
      status
    }
  }
`;

export const getPosts = (host: string) => gql`
  query GetPosts {
    publication(host: "${host}") {
      isTeam
      title
      posts(first: 10) {
        edges {
          node {
            id
            coverImage {
              url
            }
            publishedAt
            readTimeInMinutes
            slug
            subtitle
            views
            title
            brief
            url
            author {
              name
            }
          }
        }
      }
    }
  }
`;

export const getPostBySlug = (host: string) => gql`
  query GetPostBySlug($slug: String!) {
    publication(host: "${host}") {
      post(slug: $slug) {
        id
        slug
        subtitle
        views
        title
        brief
        publishedAt
        readTimeInMinutes
        coverImage {
          url
        }
        updatedAt
        featuredAt
        content {
          markdown
          html
        }
        url
        author {
          name
        }
      }
    }
  }
`;
