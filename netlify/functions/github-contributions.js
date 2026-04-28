const GITHUB_GRAPHQL_URL = "https://api.github.com/graphql";

const query = `
  query ($username: String!, $from: DateTime!, $to: DateTime!) {
    user(login: $username) {
      contributionsCollection(from: $from, to: $to) {
        contributionCalendar {
          totalContributions
          weeks {
            contributionDays {
              date
              contributionCount
              contributionLevel
            }
          }
        }
      }
    }
  }
`;

exports.handler = async function handler(event) {
  const token = process.env.GITHUB_TOKEN;
  if (!token) {
    return {
      statusCode: 500,
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ error: "Missing GITHUB_TOKEN environment variable." })
    };
  }

  const username = event.queryStringParameters?.username || "julianashi11";
  const to = new Date();
  const from = new Date(to);
  from.setFullYear(from.getFullYear() - 1);

  try {
    const response = await fetch(GITHUB_GRAPHQL_URL, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${token}`
      },
      body: JSON.stringify({
        query,
        variables: {
          username,
          from: from.toISOString(),
          to: to.toISOString()
        }
      })
    });

    const payload = await response.json();
    const calendar = payload?.data?.user?.contributionsCollection?.contributionCalendar;

    if (!response.ok || payload.errors || !calendar) {
      return {
        statusCode: 502,
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          error: "GitHub GraphQL request failed.",
          status: response.status,
          details: payload.errors || null
        })
      };
    }

    return {
      statusCode: 200,
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ username, contributionCalendar: calendar })
    };
  } catch (error) {
    return {
      statusCode: 500,
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ error: "Unexpected server error." })
    };
  }
};
