# 06 Permissions Matrix

## Roles

- **Platform Admin** (User.platformRole = 'admin'): System-level access. Can view all users, brokerages, and invitations. One or more per platform.
- **Broker Owner** (BrokerageMembership.role = 'broker_owner'): Owns a brokerage. Full access to broker portal. One per brokerage.
- **Broker Manager** (BrokerageMembership.role = 'broker_admin'): Manages a brokerage. Same as owner except cannot delete brokerage.
- **Realtor Member** (BrokerageMembership.role = 'realtor_member'): Member of a brokerage. Has own workspace. Sees brokerage name in sidebar.
- **Solo Realtor** (default, no brokerage membership): Owns their workspace. Full access to their space.

## Route Access Matrix

| Route | Platform Admin | Broker Owner | Broker Manager | Realtor Member | Solo Realtor | Public |
|-------|---------------|-------------|----------------|----------------|-------------|--------|
| / (home/sign-in) | redirect | redirect | redirect | redirect | redirect | full |
| /sign-in, /sign-up | redirect | redirect | redirect | redirect | redirect | full |
| /login/broker | redirect | redirect | redirect | redirect | redirect | full |
| /login/realtor | redirect | redirect | redirect | redirect | redirect | full |
| /dashboard | full | full | full | full | full | none |
| /setup | full | full | full | full | full | none |
| /s/[slug] (own space) | full | full | full | full | full | none |
| /s/[slug]/leads | full | full | full | full | full | none |
| /s/[slug]/contacts | full | full | full | full | full | none |
| /s/[slug]/deals | full | full | full | full | full | none |
| /s/[slug]/tours | full | full | full | full | full | none |
| /s/[slug]/analytics | full | full | full | full | full | none |
| /s/[slug]/ai | full | full | full | full | full | none |
| /s/[slug]/profile | full | full | full | full | full | none |
| /s/[slug]/settings | full | full | full | full | full | none |
| /s/[slug]/configure | full | full | full | full | full | none |
| /s/[slug]/billing | full | full | full | full | full | none |
| /broker | none | full | full | none | none | none |
| /broker/realtors | none | full | full | none | none | none |
| /broker/members | none | full | full | none | none | none |
| /broker/invitations | none | full | full | none | none | none |
| /broker/settings | none | full | view | none | none | none |
| /admin | full | none | none | none | none | none |
| /admin/users | full | none | none | none | none | none |
| /admin/brokerages | full | none | none | none | none | none |
| /admin/invitations | full | none | none | none | none | none |
| /apply/[slug] | full | full | full | full | full | full |
| /book/[slug] | full | full | full | full | full | full |
| /invite/[token] | full | full | full | full | full | full |
| /join/[code] | full | full | full | full | full | full |
| /pricing | full | full | full | full | full | full |
| /features | full | full | full | full | full | full |
| /faq | full | full | full | full | full | full |
| /legal/* | full | full | full | full | full | full |

## Enforcement Rules

- **Middleware layer** (`middleware.ts`): Clerk middleware protects all routes matching `/dashboard`, `/s/*`, `/setup`, `/admin`, `/broker`, `/invite/*`, `/join/*`, `/auth/*`. Admin routes additionally check `sessionClaims.publicMetadata.role === 'admin'`.
- **API layer**: Each API route calls `auth()` for userId. Admin routes call `requirePlatformAdmin()`. Broker routes call `requireBroker()`. Space routes verify space ownership via `getCurrentDbUser()` + space lookup.
- **UI layer**: Sidebar conditionally shows broker nav link based on `isBroker` prop. Admin nav only shown to admins. Brokerage name shown to brokerage members.
- **Data isolation**: All space data is filtered by `spaceId`. Layout verifies `dbUser.space.id === space.id` to prevent cross-space access.

## Notes

- Platform Admin is assigned via User.platformRole in DB or Clerk publicMetadata.role (backwards compat).
- Broker roles are derived from BrokerageMembership records, not User fields.
- A user can be both a realtor (own space) and a broker (accountType='both').
- Space ownership is 1:1 — one user, one space. Space.ownerId is UNIQUE.
- Authenticated users visiting sign-in/sign-up pages are redirected to `/`.
