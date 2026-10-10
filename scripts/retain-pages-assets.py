"""Keep hashed assets from previous Pages deployments for already-open tabs."""
import shutil
import sys
import tarfile
from pathlib import Path, PurePosixPath


def retain(archive, destination=Path("dist")):
    destination = Path(destination)
    copied = 0
    with tarfile.open(archive) as source:
        for member in source:
            path = PurePosixPath(member.name)
            # Never extract HTML, links, absolute paths, or nested/traversing paths.
            if (not member.isfile() or path.is_absolute() or len(path.parts) != 2
                    or path.parts[0] != "assets" or path.suffix not in (".js", ".css")):
                continue
            target = destination / "assets" / path.name
            if target.exists():
                continue  # The current build always wins.
            target.parent.mkdir(parents=True, exist_ok=True)
            with source.extractfile(member) as content, target.open("wb") as output:
                shutil.copyfileobj(content, output)
            copied += 1
    return copied


if __name__ == "__main__":
    print(f"Retained {retain(sys.argv[1])} previous JS/CSS assets")
