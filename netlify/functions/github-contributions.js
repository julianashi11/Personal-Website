const GITHUB_GRAPHQL_URL = "https://api.github.com/graphql";
const PUBLIC_API_URL = "https://github-contributions-api.jogruber.de/v4";

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

const LEVELS = ["NONE", "FIRST_QUARTILE", "SECOND_QUARTILE", "THIRD_QUARTILE", "FOURTH_QUARTILE"];

function json(statusCode, body) {
  return {
    statusCode,
    headers: {
      "content-type": "application/json",
      // Cache for an hour at the CDN so we don't hammer GitHub.
      "cache-control": "public, max-age=0, s-maxage=3600"
    },
    body: JSON.stringify(body)
  };
}

// Official GitHub GraphQL API — needs a valid GITHUB_TOKEN (read:user scope is enough).
async function fromGraphQL(username, token) {
  const to = new Date();
  const from = new Date(to);
  from.setFullYear(from.getFullYear() - 1);

  const response = await fetch(GITHUB_GRAPHQL_URL, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
    body: JSON.stringify({
      query,
      variables: { username, from: from.toISOString(), to: to.toISOString() }
    })
  });
  const payload = await response.json();
  const calendar = payload?.data?.user?.contributionsCollection?.contributionCalendar;
  if (!response.ok || payload.errors || !calendar) {
    throw new Error(`GraphQL failed (${response.status})`);
  }
  return calendar;
}

// Public, token-free mirror of the contribution graph. Normalized to the GraphQL shape.
async function fromPublicApi(username) {
  const response = await fetch(`${PUBLIC_API_URL}/${encodeURIComponent(username)}?y=last`);
  if (!response.ok) throw new Error(`Public API failed (${response.status})`);
  const data = await response.json();
  const days = Array.isArray(data.contributions) ? data.contributions : [];

  const weeks = [];
  let current = [];
  days.forEach((d, i) => {
    const weekday = new Date(`${d.date}T00:00:00Z`).getUTCDay();
    if (weekday === 0 && current.length) {
      weeks.push({ contributionDays: current });
      current = [];
    }
    current.push({
      date: d.date,
      contributionCount: d.count || 0,
      contributionLevel: LEVELS[d.level] || "NONE"
    });
    if (i === days.length - 1) weeks.push({ contributionDays: current });
  });

  return { totalContributions: data.total?.lastYear ?? days.reduce((s, d) => s + (d.count || 0), 0), weeks };
}

exports.handler = async function handler(event) {
  const username = event.queryStringParameters?.username || "julianashi11";
  if (!/^[a-z\d](?:[a-z\d-]{0,38})$/i.test(username)) {
    return json(400, { error: "Invalid username." });
  }

  const token = process.env.GITHUB_TOKEN;
  if (token) {
    try {
      const calendar = await fromGraphQL(username, token);
      return json(200, { username, source: "graphql", contributionCalendar: calendar });
    } catch (error) {
      console.warn("GitHub GraphQL failed, falling back to public API:", error.message);
    }
  }

  try {
    const calendar = await fromPublicApi(username);
    return json(200, { username, source: "public", contributionCalendar: calendar });
  } catch (error) {
    return json(502, { error: "Could not load contributions." });
  }
};
