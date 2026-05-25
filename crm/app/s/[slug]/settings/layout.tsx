/**
 * Settings layout — bare pass-through. The previous tab strip carried five
 * destinations; the new /settings is one page, one scroll. Brokerage stays
 * as its own page (auth-gated context, not configuration), and renders its
 * own header.
 */
export default function SettingsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
