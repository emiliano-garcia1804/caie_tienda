import importlib.util
import io
import tarfile
import tempfile
import unittest
from pathlib import Path

spec = importlib.util.spec_from_file_location("retain", "scripts/retain-pages-assets.py")
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)


class RetainAssetsTest(unittest.TestCase):
    def test_old_modules_survive_without_replacing_current_build_or_extracting_other_files(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            destination = root / "dist"
            (destination / "assets").mkdir(parents=True)
            (destination / "assets/current.js").write_bytes(b"current build")
            archive = root / "artifact.tar"
            with tarfile.open(archive, "w") as output:
                for name in ("./assets/old.js", "./assets/old.css", "./assets/current.js",
                             "./index.html", "assets/../../outside.js", "/assets/absolute.js"):
                    entry = tarfile.TarInfo(name)
                    entry.size = 3
                    output.addfile(entry, io.BytesIO(b"old"))
                link = tarfile.TarInfo("assets/link.js")
                link.type = tarfile.SYMTYPE
                link.linkname = "../../outside.js"
                output.addfile(link)
            self.assertEqual(module.retain(archive, destination), 2)
            self.assertEqual((destination / "assets/old.js").read_bytes(), b"old")
            self.assertEqual((destination / "assets/current.js").read_bytes(), b"current build")
            self.assertEqual(sorted(p.name for p in (destination / "assets").iterdir()),
                             ["current.js", "old.css", "old.js"])
            self.assertFalse((destination / "index.html").exists())
            self.assertFalse((root / "outside.js").exists())


if __name__ == "__main__":
    unittest.main()
