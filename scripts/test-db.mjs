import { spawnSync } from "node:child_process";
import {
  readFileSync,
  existsSync,
  mkdirSync,
  writeFileSync,
  chmodSync,
  openSync,
  closeSync,
} from "node:fs";
import { resolve, join } from "node:path";
import { randomUUID } from "node:crypto";
import { createServer } from "node:net";
import assert from "node:assert/strict";
import pg from "pg";
const root = resolve("."),
  local = join(root, ".local"),
  cluster = join(local, "pg-test-cluster"),
  socketDir = join(local, "pg-test-sockets"),
  logPath = join(local, "postgres-test.log"),
  port = 55439;
const pgConfig = spawnSync("pg_config", ["--bindir"], {
  encoding: "utf8",
  windowsHide: true,
});
const bin =
  process.env.CAIE_PG_BIN ||
  (pgConfig.status === 0 && pgConfig.stdout.trim()) ||
  (process.platform === "win32"
    ? "C:/Program Files/PostgreSQL/15/bin"
    : "/usr/lib/postgresql/15/bin");
const exe = (name) =>
  join(bin, name + (process.platform === "win32" ? ".exe" : ""));
mkdirSync(local, { recursive: true });
function run(name, args) {
  // On Windows postgres can inherit pg_ctl's output handles. Use a file for
  // startup output so spawnSync does not wait for a pipe held by the server.
  const outputPath = join(local, "pg-ctl-start.log");
  const fd =
    name === "pg_ctl" && args.at(-1) === "start"
      ? openSync(outputPath, "w")
      : undefined;
  try {
    const r = spawnSync(exe(name), args, {
      encoding: "utf8",
      windowsHide: true,
      ...(fd === undefined ? {} : { stdio: ["ignore", fd, fd] }),
    });
    if (fd !== undefined) r.stdout = readFileSync(outputPath, "utf8");
    return r;
  } finally {
    if (fd !== undefined) closeSync(fd);
  }
}
function command(name, args) {
  const r = run(name, args);
  if (r.error || r.status !== 0)
    throw new Error(
      `${exe(name)}: exit ${r.status}, signal ${r.signal ?? "none"}\n${r.error?.message ?? ""}\n${r.stdout ?? ""}${r.stderr ?? ""}`,
    );
  return r.stdout.trim();
}
function printLog() {
  if (!logPrepared) {
    console.error("PostgreSQL was not launched; no server log for this run.");
    return;
  }
  try {
    console.error(
      `--- ${logPath} (last 100 lines) ---\n${readFileSync(logPath, "utf8").split(/\r?\n/).slice(-100).join("\n")}`,
    );
  } catch (e) {
    console.error(`Unable to read PostgreSQL log: ${e.message}`);
  }
}
const db = "caie_test_" + randomUUID().replaceAll("-", ""),
  connection = { host: "127.0.0.1", port, user: "caie_test", database: db };
let master,
  pool,
  started = false,
  databaseCreated = false,
  logPrepared = false,
  engine = "PostgreSQL (version unavailable)";
const results = [];
try {
  const versions = ["postgres", "initdb", "pg_ctl"].map((name) =>
    command(name, ["--version"]),
  );
  const major = versions[0].match(/PostgreSQL\) (\d+)/)?.[1];
  if (
    !major ||
    Number(major) < 15 ||
    versions.some((v) => v.match(/PostgreSQL\) (\d+)/)?.[1] !== major)
  )
    throw new Error(
      `Expected matching PostgreSQL >=15 binaries: ${versions.join(", ")}`,
    );
  engine = `${versions[0]}; auth.uid shim local, sin servicio Supabase Auth`;
  console.log(`PostgreSQL binaries: ${bin}\n${versions.join("\n")}`);
  if (existsSync(cluster) && !existsSync(join(cluster, "CAIE_TEST_ONLY")))
    throw new Error("Refusing to use an unowned PostgreSQL cluster.");
  if (!existsSync(join(cluster, "PG_VERSION"))) {
    command("initdb", [
      "-D",
      cluster,
      "-U",
      "caie_test",
      "--auth=trust",
      "--encoding=UTF8",
      "--locale=C",
    ]);
    writeFileSync(join(cluster, "CAIE_TEST_ONLY"), "Synthetic tests only");
  }
  if (readFileSync(join(cluster, "PG_VERSION"), "utf8").trim() !== major)
    throw new Error(
      "Test cluster version does not match PostgreSQL binaries; use a matching CAIE_PG_BIN.",
    );
  const status = run("pg_ctl", ["-D", cluster, "status"]);
  if (status.status !== 3)
    throw new Error(
      `Refusing to start an already running or inaccessible test cluster: ${status.stdout}${status.stderr}`,
    );
  // Never connect to another service that already owns the test port.
  await new Promise((resolve, reject) => {
    const probe = createServer();
    probe.once("error", reject);
    probe.listen({ host: "127.0.0.1", port, exclusive: true }, () =>
      probe.close((e) => (e ? reject(e) : resolve())),
    );
  });
  if (process.platform !== "win32") {
    mkdirSync(socketDir, { recursive: true, mode: 0o700 });
    chmodSync(socketDir, 0o700);
  }
  writeFileSync(logPath, "");
  logPrepared = true;
  // Windows uses TCP only; Linux must not use the package's system socket directory.
  const options = `-p ${port} -h 127.0.0.1 -k "${process.platform === "win32" ? "" : socketDir}" -c unix_socket_permissions=0700`;
  try {
    command("pg_ctl", [
      "-D",
      cluster,
      "-l",
      logPath,
      "-o",
      options,
      "-w",
      "-t",
      "60",
      "start",
    ]);
    started = true;
  } catch (e) {
    // A startup timeout can leave a live server. Stop only our previously stopped cluster.
    started = run("pg_ctl", ["-D", cluster, "status"]).status === 0;
    throw e;
  }
  master = new pg.Client({
    ...connection,
    database: "postgres",
    connectionTimeoutMillis: 5000,
  });
  await master.connect();
  // Verify the instance before creating or modifying any database.
  assert.equal(
    resolve((await master.query("show data_directory")).rows[0].data_directory),
    cluster,
  );
  assert.equal(
    (await master.query("show unix_socket_directories")).rows[0]
      .unix_socket_directories,
    process.platform === "win32" ? "" : socketDir,
  );
  await master.query(`create database ${db}`);
  databaseCreated = true;
  pool = new pg.Pool({ ...connection, max: 12 });
  pool.on("error", () => {});
  await pool.query(
    `do $$begin if not exists(select 1 from pg_roles where rolname='anon') then create role anon nologin;end if;if not exists(select 1 from pg_roles where rolname='authenticated') then create role authenticated nologin;end if;end$$; create schema auth; create table auth.users(id uuid primary key); create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$; grant usage on schema auth to authenticated; grant execute on function auth.uid() to authenticated;`,
  );
  const migration = readFileSync(
    join(root, "supabase/migrations/202610090001_core.sql"),
    "utf8",
  );
  try {
    await pool.query(migration);
  } catch (e) {
    if (e.position)
      console.error(
        "SQL near error:",
        migration.slice(Number(e.position) - 100, Number(e.position) + 100),
      );
    throw e;
  }
  const admin = randomUUID(),
    operators = Array.from({ length: 5 }, randomUUID);
  const ids = {
    people: Array.from({ length: 6 }, randomUUID),
    products: Array.from({ length: 6 }, randomUUID),
    event: randomUUID(),
  };
  async function as(user, sql, params = []) {
    const c = await pool.connect();
    try {
      await c.query("begin");
      await c.query("set local role authenticated");
      await c.query("select set_config('request.jwt.claim.sub',$1,true)", [
        user || "",
      ]);
      const r = await c.query(sql, params);
      await c.query("commit");
      return r.rows;
    } catch (e) {
      await c.query("rollback");
      throw e;
    } finally {
      c.release();
    }
  }
  async function anonymous(sql) {
    const c = await pool.connect();
    try {
      await c.query("begin");
      await c.query("set local role anon");
      return await c.query(sql);
    } finally {
      await c.query("rollback");
      c.release();
    }
  }
  async function seed({ stock = 20, balance = "20", price = "2" } = {}) {
    await pool.query(
      "truncate public.audit_log,public.import_batches,public.purchase_items,public.purchases,public.events,public.products,public.participants,public.profiles,auth.users restart identity cascade",
    );
    for (const [i, id] of [admin, ...operators].entries()) {
      await pool.query("insert into auth.users values($1)", [id]);
      await pool.query(
        "insert into public.profiles(id,display_name,role) values($1,$2,$3)",
        [id, `Usuario sintético ${i}`, i === 0 ? "admin" : "operator"],
      );
    }
    await pool.query(
      "insert into public.events(id,name,event_date,state) values($1,'Evento sintético','2026-10-09','active')",
      [ids.event],
    );
    for (const [i, id] of ids.people.entries())
      await pool.query(
        "insert into public.participants(id,name,group_name,balance) values($1,$2,'Pequeños',$3)",
        [id, `Participante sintético ${i}`, balance],
      );
    for (const [i, id] of ids.products.entries())
      await pool.query(
        "insert into public.products(id,name,category,price,stock) values($1,$2,'Hogar',$3,$4)",
        [id, `Producto sintético ${i}`, price, stock],
      );
  }
  const items = (product = ids.products[0], qty = 1, price = "2") => [
    { product_id: product, quantity: qty, expected_price: price },
  ];
  const buy = (
    user = operators[0],
    person = ids.people[0],
    products = items(),
    key = randomUUID(),
    event = ids.event,
  ) =>
    as(user, "select public.confirm_purchase($1,$2,$3,$4) result", [
      person,
      event,
      key,
      JSON.stringify(products),
    ]).then((r) => r[0].result);
  const balances = async () => {
    const p = await pool.query(
      "select balance::text from public.participants where id=$1",
      [ids.people[0]],
    );
    const i = await pool.query(
      "select stock from public.products where id=$1",
      [ids.products[0]],
    );
    const c = await pool.query("select count(*)::int n from public.purchases");
    return [p.rows[0].balance, i.rows[0].stock, c.rows[0].n];
  };
  async function test(name, fn) {
    try {
      await fn();
      results.push({ name, status: "PASS" });
      console.log(`PASS ${name}`);
    } catch (e) {
      results.push({ name, status: "FAIL", error: e.message });
      console.error(`FAIL ${name}: ${e.stack}`);
    }
  }
  await test(`Migración completa sobre PostgreSQL ${major} real`, async () => {
    assert.equal(
      (
        await pool.query(
          "select count(*)::int n from pg_tables where schemaname='public'",
        )
      ).rows[0].n,
      8,
    );
  });
  await test("Compra de un artículo, saldo, inventario y Status", async () => {
    await seed();
    const r = await buy();
    assert.equal(r.total, "2.000");
    assert.deepEqual(await balances(), ["18.000", 19, 1]);
    const s = (await as(operators[0], "select public.app_snapshot() s"))[0].s;
    assert.equal(
      s.participants.find((p) => p.id === ids.people[0]).purchased,
      true,
    );
    assert.equal(s.purchases[0].items[0].unit_price, "2.000");
  });
  await test("Múltiples artículos y varias unidades", async () => {
    await seed();
    const r = await buy(operators[0], ids.people[0], [
      ...items(ids.products[0], 2),
      ...items(ids.products[1], 3),
    ]);
    assert.equal(r.total, "10.000");
    assert.deepEqual(await balances(), ["10.000", 18, 1]);
  });
  await test("Horas fraccionarias exactas", async () => {
    await seed({ balance: "0.3", price: "0.1" });
    const r = await buy(
      operators[0],
      ids.people[0],
      items(ids.products[0], 3, "0.1"),
    );
    assert.equal(r.balance_after, "0.000");
    assert.deepEqual(await balances(), ["0.000", 17, 1]);
  });
  for (const [name, setup, selection, message] of [
    [
      "Saldo insuficiente",
      () => seed({ balance: "1" }),
      () => items(),
      /Saldo insuficiente/,
    ],
    [
      "Inventario insuficiente",
      () => seed({ stock: 1 }),
      () => items(ids.products[0], 2),
      /Inventario insuficiente/,
    ],
    [
      "Producto agotado",
      () => seed({ stock: 0 }),
      () => items(),
      /Inventario insuficiente/,
    ],
    [
      "Precio NA",
      async () => {
        await seed();
        await pool.query("update public.products set price=null where id=$1", [
          ids.products[0],
        ]);
      },
      () => items(),
      /pendiente/,
    ],
    [
      "Inventario NA",
      async () => {
        await seed();
        await pool.query("update public.products set stock=null where id=$1", [
          ids.products[0],
        ]);
      },
      () => items(),
      /pendiente/,
    ],
    [
      "Precio alterado desde navegador",
      () => seed(),
      () => items(ids.products[0], 1, "0"),
      /precio/,
    ],
    [
      "Cantidad fraccionaria",
      () => seed(),
      () => items(ids.products[0], 1.5),
      /cantidades/,
    ],
    [
      "Productos duplicados",
      () => seed(),
      () => [...items(), ...items()],
      /repetidos/,
    ],
  ])
    await test(name, async () => {
      await setup();
      await assert.rejects(
        () => buy(operators[0], ids.people[0], selection()),
        message,
      );
      assert.equal(
        (await pool.query("select count(*)::int n from public.purchases"))
          .rows[0].n,
        0,
      );
    });
  await test("Segunda compra del mismo participante permitida", async () => {
    await seed();
    await buy();
    await buy();
    assert.deepEqual(await balances(), ["16.000", 18, 2]);
  });
  await test("Anulación atómica, restitución, Status y doble anulación", async () => {
    await seed();
    const r = await buy();
    await as(admin, "select public.cancel_purchase($1,$2)", [
      r.id,
      "Captura incorrecta",
    ]);
    assert.deepEqual(await balances(), ["20.000", 20, 1]);
    const s = (await as(admin, "select public.app_snapshot() s"))[0].s;
    assert.equal(
      s.participants.find((p) => p.id === ids.people[0]).purchased,
      false,
    );
    assert.equal(s.purchases[0].state, "cancelled");
    await assert.rejects(
      () =>
        as(admin, "select public.cancel_purchase($1,$2)", [r.id, "Repetición"]),
      /ya fue anulada/,
    );
  });
  await test("Anular una compra conserva Status si hay otra vigente", async () => {
    await seed();
    const r = await buy();
    await buy();
    await as(admin, "select public.cancel_purchase($1,$2)", [
      r.id,
      "Captura incorrecta",
    ]);
    const s = (await as(admin, "select public.app_snapshot() s"))[0].s;
    assert.equal(
      s.participants.find((p) => p.id === ids.people[0]).purchased,
      true,
    );
  });
  await test("Nuevo evento reinicia Status y conserva saldos e inventario", async () => {
    await seed();
    await buy();
    await as(admin, "select public.admin_event($1,null,null,'close')", [
      ids.event,
    ]);
    const next = (
      await as(
        admin,
        "select public.admin_event(null,'Siguiente','2026-10-10','create') id",
      )
    )[0].id;
    await as(admin, "select public.admin_event($1,null,null,'activate')", [
      next,
    ]);
    const s = (await as(admin, "select public.app_snapshot() s"))[0].s;
    assert.equal(
      s.participants.find((p) => p.id === ids.people[0]).purchased,
      false,
    );
    assert.deepEqual(await balances(), ["18.000", 19, 1]);
    await assert.rejects(
      () =>
        as(
          admin,
          "select public.admin_event(null,'Otro','2026-10-10','create') id",
        ).then(async (r) =>
          as(admin, "select public.admin_event($1,null,null,'activate')", [
            r[0].id,
          ]),
        ),
      /Cierra el evento/,
    );
  });
  await test("A: dos operadores compiten por última unidad", async () => {
    await seed({ stock: 1 });
    const r = await Promise.allSettled([
      buy(operators[0], ids.people[0]),
      buy(operators[1], ids.people[1]),
    ]);
    assert.equal(r.filter((x) => x.status === "fulfilled").length, 1);
    assert.equal((await balances())[1], 0);
  });
  await test("B: dos operadores compiten por últimas horas", async () => {
    await seed({ balance: "2" });
    const r = await Promise.allSettled([buy(operators[0]), buy(operators[1])]);
    assert.equal(r.filter((x) => x.status === "fulfilled").length, 1);
    assert.deepEqual(await balances(), ["0.000", 19, 1]);
  });
  await test("C: cinco operadores simultáneos sin actualizaciones perdidas", async () => {
    await seed();
    await Promise.all(operators.map((u, i) => buy(u, ids.people[i])));
    assert.equal((await balances())[1], 15);
    assert.equal((await balances())[2], 5);
    assert.equal(
      (await pool.query("select sum(balance)::text s from public.participants"))
        .rows[0].s,
      "110.000",
    );
  });
  await test("Cinco sesiones de la misma cuenta CAIE conservan consistencia", async () => {
    await seed();
    await Promise.all(
      ids.people.slice(0, 5).map((person) => buy(operators[0], person)),
    );
    assert.equal((await balances())[1], 15);
    assert.equal((await balances())[2], 5);
  });
  await test("D: doble confirmación concurrente idempotente", async () => {
    await seed();
    const key = randomUUID();
    const r = await Promise.all([
      buy(operators[0], ids.people[0], items(), key),
      buy(operators[0], ids.people[0], items(), key),
    ]);
    assert.equal(r[0].id, r[1].id);
    assert.deepEqual(await balances(), ["18.000", 19, 1]);
    await assert.rejects(
      () => buy(operators[0], ids.people[0], items(ids.products[0], 2), key),
      /otra operación/,
    );
  });
  await test("E: respuesta descartada después de commit; reintento recupera resultado", async () => {
    await seed();
    const key = randomUUID();
    await buy(operators[0], ids.people[0], items(), key);
    const recovered = await buy(operators[0], ids.people[0], items(), key);
    assert.ok(recovered.id);
    assert.deepEqual(await balances(), ["18.000", 19, 1]);
  });
  await test("F: fallo inyectado después de descuentos revierte toda la transacción", async () => {
    await seed();
    await pool.query(
      `create function public.inject_test_failure() returns trigger language plpgsql as $$begin raise exception 'Fallo inyectado';end$$;create trigger fail_late after update on public.participants for each row execute function public.inject_test_failure()`,
    );
    const before = (
      await pool.query("select count(*)::int n from public.audit_log")
    ).rows[0].n;
    await assert.rejects(() => buy(), /Fallo inyectado/);
    assert.deepEqual(await balances(), ["20.000", 20, 0]);
    assert.equal(
      (await pool.query("select count(*)::int n from public.audit_log")).rows[0]
        .n,
      before,
    );
    await pool.query(
      "drop trigger fail_late on public.participants;drop function public.inject_test_failure()",
    );
  });
  await test("Carritos opuestos no causan deadlock", async () => {
    await seed();
    await Promise.all([
      buy(operators[0], ids.people[0], [
        ...items(ids.products[0]),
        ...items(ids.products[1]),
      ]),
      buy(operators[1], ids.people[1], [
        ...items(ids.products[1]),
        ...items(ids.products[0]),
      ]),
    ]);
    assert.equal((await balances())[2], 2);
  });
  await test("Anónimo no lee participantes ni compras ni ejecuta RPC", async () => {
    await seed();
    for (const sql of [
      "select * from public.participants",
      "select * from public.purchases",
      "select public.app_snapshot()",
    ])
      await assert.rejects(() => anonymous(sql), /permission denied/);
  });
  await test("Operador no modifica directamente saldos, precios ni permisos", async () => {
    await seed();
    for (const sql of [
      "update public.participants set balance=999",
      "update public.products set price=0",
      "update public.profiles set role='admin'",
    ])
      await assert.rejects(() => as(operators[0], sql), /permission denied/);
  });
  await test("RLS rechaza lectura por usuario sin perfil y perfil desactivado", async () => {
    await seed();
    assert.equal(
      (await as(randomUUID(), "select * from public.participants")).length,
      0,
    );
    await pool.query("update public.profiles set active=false where id=$1", [
      operators[0],
    ]);
    assert.equal(
      (await as(operators[0], "select * from public.participants")).length,
      0,
    );
    await assert.rejects(() => buy(), /autorización/);
  });
  await test("RPC administrativas y exportación restringidas", async () => {
    await seed();
    for (const sql of [
      "select public.export_snapshot()",
      `select public.admin_event(null,'No autorizado','2026-10-09','create')`,
      `select public.initial_import(repeat('a',64),'[]','[]')`,
    ])
      await assert.rejects(() => as(operators[0], sql), /autorización/);
    assert.ok(
      (await as(admin, "select public.export_snapshot() s"))[0].s.participants
        .length,
    );
  });
  await test("Ajuste de horas auditado y formulario obsoleto rechazado", async () => {
    await seed();
    await as(
      admin,
      "select public.admin_participant($1,'Corregido','Mamás','21','Ajuste educativo','20')",
      [ids.people[0]],
    );
    assert.equal((await balances())[0], "21.000");
    await assert.rejects(
      () =>
        as(
          admin,
          "select public.admin_participant($1,'Corregido','Mamás','22','Ajuste educativo','20')",
          [ids.people[0]],
        ),
      /saldo cambió/,
    );
    assert.equal(
      (
        await pool.query(
          "select count(*)::int n from public.audit_log where reason='Ajuste educativo'",
        )
      ).rows[0].n,
      1,
    );
  });
  await test("Ajuste de producto y protección contra existencias obsoletas", async () => {
    await seed();
    await as(
      admin,
      "select public.admin_product($1,'Corregido','Hogar','3',25,true,'Reabastecimiento',20,'2')",
      [ids.products[0]],
    );
    assert.equal((await balances())[1], 25);
    await assert.rejects(
      () =>
        as(
          admin,
          "select public.admin_product($1,'Corregido','Hogar','3',30,true,'Reabastecimiento',20,'2')",
          [ids.products[0]],
        ),
      /producto cambió/,
    );
    await assert.rejects(
      () =>
        as(
          admin,
          "select public.admin_product($1,'Corregido','Hogar','3',null,true,'Borrar inventario',25,'3')",
          [ids.products[0]],
        ),
      /borrar/,
    );
  });
  await test("Importación inicial y reimportación sin sobrescribir compras", async () => {
    await seed();
    await pool.query(
      "truncate public.purchase_items,public.purchases,public.products,public.participants cascade",
    );
    const people = [
        {
          name: "Persona sintética",
          group_name: "Mamás",
          balance: "12",
          original_status: null,
        },
      ],
      products = [
        {
          name: "Producto sintético",
          category: "Hogar",
          price: "2",
          stock: 10,
        },
        {
          name: "Precio pendiente",
          category: "Juguetes",
          price: null,
          stock: 3,
        },
        {
          name: "Stock pendiente",
          category: "Juguetes",
          price: "1",
          stock: null,
        },
      ];
    const params = [
      "a".repeat(64),
      JSON.stringify(people),
      JSON.stringify(products),
    ];
    const r = (
      await as(admin, "select public.initial_import($1,$2,$3) r", params)
    )[0].r;
    assert.equal(r.participants_imported, 1);
    const p = (await pool.query("select id from public.participants")).rows[0]
        .id,
      prod = (
        await pool.query(
          "select id from public.products where name='Producto sintético'",
        )
      ).rows[0].id;
    await buy(operators[0], p, items(prod));
    const repeated = (
      await as(admin, "select public.initial_import($1,$2,$3) r", params)
    )[0].r;
    assert.equal(repeated.already_imported, true);
    assert.equal(
      (await pool.query("select balance::text from public.participants"))
        .rows[0].balance,
      "10.000",
    );
    await assert.rejects(
      () =>
        as(admin, "select public.initial_import($1,$2,$3)", [
          "b".repeat(64),
          params[1],
          params[2],
        ]),
      /cerrada/,
    );
  });
  await test("Importación ambigua o inválida revierte todos los registros", async () => {
    await seed();
    await pool.query(
      "truncate public.purchase_items,public.purchases,public.products,public.participants cascade",
    );
    const p = [
      { name: "  José Ejemplo ", group_name: "Grandes", balance: "4" },
      { name: "Jose  Ejemplo", group_name: "Grandes", balance: "4" },
    ];
    await assert.rejects(
      () =>
        as(admin, "select public.initial_import($1,$2,$3)", [
          "c".repeat(64),
          JSON.stringify(p),
          JSON.stringify([
            { name: "X", category: "Hogar", price: "1", stock: 2 },
          ]),
        ]),
      /ambiguos/,
    );
    assert.equal(
      (await pool.query("select count(*)::int n from public.participants"))
        .rows[0].n,
      0,
    );
  });
  await test("Exportación snapshot consistente durante cinco compras", async () => {
    await seed();
    const all = await Promise.all([
      ...operators.map((u, i) => buy(u, ids.people[i])),
      as(admin, "select public.export_snapshot() s"),
    ]);
    const s = all.at(-1)[0].s;
    const sold = s.purchases.length;
    assert.equal(
      s.products.find((p) => p.id === ids.products[0]).stock,
      20 - sold,
    );
    assert.equal(
      s.participants.reduce((v, p) => v + Number(p.balance), 0),
      120 - sold * 2,
    );
  });
  await test("Todas las tablas protegidas con RLS y SECURITY DEFINER con search_path vacío", async () => {
    const tables = await pool.query(
      "select relname,relrowsecurity from pg_class join pg_namespace on pg_namespace.oid=relnamespace where nspname='public' and relkind='r'",
    );
    assert.ok(tables.rows.every((r) => r.relrowsecurity));
    const f = await pool.query(
      "select proname,proconfig from pg_proc join pg_namespace n on n.oid=pronamespace where n.nspname='public' and prosecdef",
    );
    assert.ok(f.rows.every((r) => r.proconfig?.includes('search_path=\"\"')));
  });
} catch (e) {
  results.push({
    name: "Infraestructura local PostgreSQL",
    status: "FAIL",
    error: e.stack,
  });
  console.error(e.stack);
  printLog();
} finally {
  async function cleanup(name, fn) {
    try {
      await fn();
    } catch (e) {
      results.push({
        name: `Limpieza: ${name}`,
        status: "FAIL",
        error: e.stack,
      });
      console.error(`Cleanup failed (${name}): ${e.stack}`);
      printLog();
    }
  }
  if (pool) await cleanup("pool", () => pool.end());
  if (master) {
    if (databaseCreated)
      await cleanup("base sintética", () =>
        master.query(`drop database if exists ${db} with (force)`),
      );
    await cleanup("conexión", () => master.end());
  }
  if (started)
    await cleanup("servidor", () =>
      command("pg_ctl", [
        "-D",
        cluster,
        "-m",
        "fast",
        "-w",
        "-t",
        "60",
        "stop",
      ]),
    );
  mkdirSync(join(root, "docs"), { recursive: true });
  writeFileSync(
    join(root, "docs/db-test-results.json"),
    JSON.stringify(
      {
        executed_at: new Date().toISOString(),
        engine,
        results,
      },
      null,
      2,
    ),
  );
}
if (results.some((r) => r.status === "FAIL")) process.exitCode = 1;
