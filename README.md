# ScrimLab

ScrimLab is a full-stack web application for esports teams to organise scrims, manage team information, prepare drafts and review match results.

I built the project to develop practical experience with modern full-stack web development, authentication, relational databases, access control and testing.

## Tech Stack

- **Next.js**
- **TypeScript**
- **React**
- **Tailwind CSS**
- **shadcn/ui**
- **Supabase**
  - PostgreSQL
  - Authentication
  - Row Level Security (RLS)
- **Git & GitHub**
- **pgTAP database testing**

## Features

### Scrim Management

Teams can schedule scrim sessions and track their status.

Completed scrims can store:

- Match date
- Team scores
- Draft plan
- Result notes
- Linked match results

Completing a scrim saves the match result and updates the scrim session together.

### Match History

Completed matches are stored in match history, allowing users to review previous results and navigate between linked scrims and match records.

### Draft Preparation

Teams can prepare draft information including priority champion picks and bans before a scrim.

### Team & Roster Management

Authenticated users can manage team-related information and player roles.

### Authentication & Access Control

Supabase Authentication is used for user accounts.

Database access is protected using PostgreSQL Row Level Security policies so users can only access or modify data they are authorised to use.

## Database Testing

The project includes a pgTAP database test suite covering areas such as:

- Ownership permissions
- Anonymous access
- Row Level Security
- Ownership spoofing
- Ownership transfers
- Foreign-key relationships
- Insert and update permissions
- API role permissions
- Protection against unauthorised `TRUNCATE` operations

Tests run against the local Supabase environment rather than the production database.

## Local Development

### Requirements

- Node.js
- Docker
- Supabase CLI

Clone the repository and install dependencies:

```bash
npm install
```

Start the local Supabase environment:

```bash
npx supabase start
```

Apply database migrations:

```bash
npx supabase migration up --local
```

Start the development server:

```bash
npm run dev
```

Open:

```text
http://localhost:3000
```

## Database Tests

With Docker and the local Supabase environment running:

```bash
npm run test:db
```

On Windows PowerShell systems where script execution is disabled, `npm.cmd` and `npx.cmd` can be used instead.

## Project Status

ScrimLab is currently under active development.

Future development will focus on expanding team-management functionality, analytics and improving the overall user experience.
