const HASHNODE_GQL_URL = 'https://gql.hashnode.com';

export const gqlClient =
  <T = unknown>(query: TemplateStringsArray | string) =>
  async (variables: Record<string, any> = {}) => {
    const queryStr = typeof query === 'string' ? query : query.join('');
    const token = process.env.HASHNODE_TOKEN || process.env.HASHNODE_API_KEY;

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };

    if (token) {
      headers['Authorization'] = token;
    }

    const response = await fetch(HASHNODE_GQL_URL, {
      method: 'POST',
      headers,
      body: JSON.stringify({ query: queryStr, variables }),
      cache: 'force-cache', // Cache the response
      next: { revalidate: 300 }, // Revalidate every 5 minutes
    });

    // Handle non-OK HTTP status
    if (!response.ok) {
      throw new Error(`GraphQL request failed with status: ${response.status}`);
    }

    // Verify response Content-Type is JSON before parsing
    const contentType = response.headers.get('content-type') || '';
    if (!contentType.includes('application/json')) {
      const text = await response.text();
      const isHtml = text.trim().startsWith('<');
      const errorMsg = isHtml
        ? 'Hashnode GraphQL endpoint returned an HTML page (API access may require a paid plan or token).'
        : `Hashnode GraphQL endpoint returned non-JSON Content-Type: ${contentType}`;
      throw new Error(errorMsg);
    }

    const data = (await response.json()) as T;
    return data;
  };

