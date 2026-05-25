# nix/packages.nix — Chippi Agent package built with uv2nix
{ inputs, ... }:
{
  perSystem =
    { pkgs, inputs', ... }:
    let
      chippiAgent = pkgs.callPackage ./chippi-agent.nix {
        inherit (inputs) uv2nix pyproject-nix pyproject-build-systems;
        npm-lockfile-fix = inputs'.npm-lockfile-fix.packages.default;
        # Only embed clean revs — dirtyRev doesn't represent any upstream
        # commit, so comparing it would always claim "update available".
        rev = inputs.self.rev or null;
      };
    in
    {
      packages = {
        default = chippiAgent;
        tui = chippiAgent.chippiTui;
        web = chippiAgent.chippiWeb;

        fix-lockfiles = chippiAgent.chippiNpmLib.mkFixLockfiles {
          packages = [ chippiAgent.chippiTui chippiAgent.chippiWeb ];
        };
      };
    };
}
