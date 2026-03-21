#!/usr/bin/env python3
"""
注册新用户（通过 Node.js + pg 写入数据库）。

依赖：Node.js（已安装）、pg 包（已在 web/node_modules 中）

用法:
  python register_user.py <手机号>
  python register_user.py <手机号> --name <姓名>
  python register_user.py <手机号> --name <姓名> --email <邮箱>

示例:
  python register_user.py 13912345678
  python register_user.py 13912345678 --name 张三
  python register_user.py 13912345678 --name 张三 --email zhangsan@example.com
"""

import argparse
import json
import os
import subprocess
import sys
import tempfile
import uuid


def _get_database_url() -> str:
    url = os.environ.get("DATABASE_URL")
    if url:
        return url
    env_path = os.path.join(os.path.dirname(__file__), "..", "web", ".env")
    if os.path.exists(env_path):
        with open(env_path) as f:
            for line in f:
                line = line.strip()
                if line.startswith("DATABASE_URL="):
                    return line.split("=", 1)[1].strip().strip('"').strip("'")
    print("❌ 找不到 DATABASE_URL，请设置环境变量或确认 web/.env 存在")
    sys.exit(1)


# Inline Node.js script that uses pg (already available in web/node_modules)
_NODE_SCRIPT = r"""
const {{ Client }} = require('{pg_path}');

async function main() {{
  const url = process.env.DB_URL;
  const phone = process.env.REG_PHONE;
  const name  = process.env.REG_NAME  || null;
  const email = process.env.REG_EMAIL || null;
  const id    = process.env.REG_ID;

  const c = new Client({{ connectionString: url }});
  await c.connect();

  // Check existing
  const check = await c.query('SELECT id, name, status FROM users WHERE phone = $1', [phone]);
  if (check.rows.length > 0) {{
    const row = check.rows[0];
    console.log(JSON.stringify({{ existed: true, id: row.id, phone, name: row.name, status: row.status }}));
    await c.end();
    return;
  }}

  await c.query(
    'INSERT INTO users (id, phone, name, email, status, created_at, updated_at) VALUES ($1,$2,$3,$4,$5,NOW(),NOW())',
    [id, phone, name, email, 'active']
  );
  console.log(JSON.stringify({{ existed: false, id, phone, name, email }}));
  await c.end();
}}

main().catch(e => {{ console.error('ERROR:', e.message); process.exit(1); }});
"""


def register(phone: str, name: str | None = None, email: str | None = None) -> dict:
    db_url = _get_database_url()

    # Locate pg module inside web/node_modules
    web_dir = os.path.join(os.path.dirname(__file__), "..", "web")
    pg_path = os.path.join(os.path.abspath(web_dir), "node_modules", "pg")
    if not os.path.isdir(pg_path):
        print("❌ 找不到 web/node_modules/pg，请先在 web/ 目录执行 npm install")
        sys.exit(1)

    user_id = str(uuid.uuid4())

    script = _NODE_SCRIPT.format(pg_path=pg_path.replace("\\", "/"))

    with tempfile.NamedTemporaryFile(mode="w", suffix=".js", delete=False) as f:
        f.write(script)
        tmp = f.name

    try:
        env = os.environ.copy()
        env["DB_URL"] = db_url
        env["REG_PHONE"] = phone
        env["REG_NAME"] = name or ""
        env["REG_EMAIL"] = email or ""
        env["REG_ID"] = user_id

        result = subprocess.run(["node", tmp], capture_output=True, text=True, env=env, timeout=30)
    finally:
        os.unlink(tmp)

    if result.returncode != 0:
        print(f"❌ 注册失败:\n{result.stderr}")
        sys.exit(1)

    # Find JSON line in stdout
    output = None
    for line in result.stdout.splitlines():
        line = line.strip()
        if line.startswith("{"):
            output = json.loads(line)
            break

    if not output:
        print(f"❌ 未知错误:\n{result.stdout}\n{result.stderr}")
        sys.exit(1)

    if output.get("existed"):
        print(f"⚠  手机号 {phone} 已注册")
        print(f"  用户ID: {output['id']}")
        print(f"  姓名:   {output.get('name') or '（未设置）'}")
        print(f"  状态:   {output.get('status')}")
    else:
        print(f"✓ 注册成功")
        print(f"  手机号: {phone}")
        print(f"  用户ID: {output['id']}")
        if name:
            print(f"  姓名:   {name}")
        if email:
            print(f"  邮箱:   {email}")

    return output


def main():
    parser = argparse.ArgumentParser(description="注册新用户")
    parser.add_argument("phone", help="手机号（唯一标识）")
    parser.add_argument("--name", default=None, help="用户姓名（可选）")
    parser.add_argument("--email", default=None, help="邮箱（可选）")
    args = parser.parse_args()

    phone = args.phone.strip()
    if not phone:
        print("❌ 手机号不能为空")
        sys.exit(1)

    register(phone, name=args.name, email=args.email)


if __name__ == "__main__":
    main()
