"""Tool modules for the Chippi agents.

Each module is its own surface; the agent factories import what they need
directly (e.g. `from tools.attachments import read_attachment`). We don't
re-export every submodule at package init to keep import side-effects to
the minimum the importer asked for.
"""

from . import attachments, properties

__all__ = ["attachments", "properties"]
