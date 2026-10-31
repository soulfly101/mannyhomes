"""Admin commands, e.g. creating the first admin:

python -m app.cli create-user --role admin --email you@example.com --name "Your Name"
"""

import argparse
import getpass
import sys

from pydantic import ValidationError
from sqlalchemy import select
from sqlalchemy.orm import Session

from .auth.passwords import hash_password
from .auth.schemas import RegisterIn
from .db import get_engine
from .models import Role, User


def create_user(db: Session, *, name: str, email: str, phone: str, password: str, role: Role) -> User:
    data = RegisterIn(name=name, email=email, phone=phone, password=password)
    if db.scalar(select(User).where(User.email == data.email)):
        raise ValueError(f"A user with email {data.email} already exists.")
    user = User(
        name=data.name,
        email=data.email,
        phone=data.phone,
        password_hash=hash_password(data.password),
        role=role,
    )
    db.add(user)
    db.commit()
    return user


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(prog="python -m app.cli")
    commands = parser.add_subparsers(dest="command", required=True)
    create = commands.add_parser("create-user", help="Create an admin, staff or tenant account.")
    create.add_argument("--role", choices=[r.value for r in Role], default=Role.ADMIN.value)
    create.add_argument("--email", required=True)
    create.add_argument("--name", required=True)
    create.add_argument("--phone", required=True, help="Ghana number, e.g. 0241234567")
    create.add_argument(
        "--password-stdin", action="store_true", help="Read the password from standard input."
    )
    args = parser.parse_args(argv)

    password = sys.stdin.readline().rstrip("\n") if args.password_stdin else getpass.getpass("Password: ")
    try:
        with Session(get_engine()) as db:
            user = create_user(
                db,
                name=args.name,
                email=args.email,
                phone=args.phone,
                password=password,
                role=Role(args.role),
            )
            created = f"Created {user.role.value} {user.email}"
    except ValidationError as e:
        print(e.errors()[0]["msg"].removeprefix("Value error, "), file=sys.stderr)
        return 1
    except ValueError as e:
        print(e, file=sys.stderr)
        return 1
    print(created)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
