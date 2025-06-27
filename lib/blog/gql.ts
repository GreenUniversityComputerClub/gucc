const HASHNODE_GQL_URL = 'https://gql.hashnode.com';

export const gqlClient =
  <T = unknown>(query: TemplateStringsArray | string) =>
  async (variables: Record<string, any> = {}) => {
    const queryStr = query;

    const response = await fetch(HASHNODE_GQL_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ query: queryStr, variables }),
      cache: 'force-cache', // Cache the response
      next: { revalidate: 300 } // Revalidate every 5 minutes
    });

    // Handle response
    if (!response.ok) {
      throw new Error(`GraphQL request failed: ${response.status}`);
    }
    const data = (await response.json()) as T;
    return data;
  };
