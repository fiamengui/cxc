const api = process.env.COMMERCIAL_PUBLIC_URL?.replace(/\/$/, "");
const token = process.env.BETA_ADMIN_TOKEN;
if (!api?.startsWith("https://") || !token || token.length < 32) {
  throw new Error("Defina COMMERCIAL_PUBLIC_URL HTTPS e BETA_ADMIN_TOKEN no ambiente seguro.");
}

const [action, first, ...rest] = process.argv.slice(2);
const request = async (path, init = {}) => {
  const response = await fetch(`${api}${path}`, {
    ...init,
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json", ...init.headers },
    signal: AbortSignal.timeout(30_000),
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(typeof body.error === "string" ? body.error : `API respondeu ${response.status}.`);
  return body;
};

let result;
if (action === "list") result = await request("/v1/admin/beta");
else if (action === "invite" && first) result = await request("/v1/admin/beta/invitations", { method:"POST", body:JSON.stringify({email:first,notes:rest.join(" ")||null}) });
else if (action === "status" && first && rest[0]) result = await request(`/v1/admin/beta/${encodeURIComponent(first)}`, { method:"PATCH", body:JSON.stringify({status:rest[0],notes:rest.slice(1).join(" ")||null}) });
else throw new Error("Uso: beta:admin -- list | invite <email> [observação] | status <uuid> <STATUS> [observação]");

process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
