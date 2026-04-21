"""Argparse CLI dispatcher for the pipeline."""

from __future__ import annotations

import argparse
import sys

from pipeline.commands.attribution import run_attribution
from pipeline.commands.fetch import run_fetch
from pipeline.commands.install import run_install
from pipeline.commands.list_sources import run_list
from pipeline.commands.process import run_process


def _build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        prog="pipeline",
        description="Asset processing pipeline for Asterion.",
    )
    sub = parser.add_subparsers(dest="command")

    # fetch
    fetch_p = sub.add_parser("fetch", help="Download source files to data/raw/")
    fetch_p.add_argument("--source", help="Process only this source id")
    fetch_p.add_argument(
        "--record",
        action="store_true",
        help="Record the observed sha256 into sources.toml",
    )

    # process
    proc_p = sub.add_parser("process", help="Run processors and install assets")
    proc_p.add_argument("--source", help="Process only this source id")

    # list
    sub.add_parser("list", help="Show sources and their status")

    # install
    sub.add_parser(
        "install", help="Copy processed assets to public/ for Vite"
    )

    # attribution
    sub.add_parser(
        "attribution", help="Regenerate ATTRIBUTION.md from provenance files"
    )

    return parser


def main(argv: list[str] | None = None) -> None:
    parser = _build_parser()
    args = parser.parse_args(argv)

    if args.command is None:
        # Default: fetch then process for all sources
        run_fetch(source_id=None, record=False)
        run_process(source_id=None)
    elif args.command == "fetch":
        run_fetch(source_id=args.source, record=args.record)
    elif args.command == "process":
        run_process(source_id=args.source)
    elif args.command == "list":
        run_list()
    elif args.command == "install":
        run_install()
    elif args.command == "attribution":
        run_attribution()
    else:
        parser.print_help()
        sys.exit(1)
