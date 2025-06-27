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
    });

    // Handle response
    if (!response.ok) {
    }
    const data = (await response.json()) as T;
    return data;
  };
