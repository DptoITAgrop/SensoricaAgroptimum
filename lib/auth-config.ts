import { compare, hash } from "bcryptjs";

export type UserRole = "admin" | "tecnico" | "finca";

export interface User {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  allowedFarms: string[] | "all"; // 'all' para admin y técnico
  passwordHash: string;
}

// Las contraseñas hasheadas se generan en el servidor
// Estas son las credenciales configuradas:
// - Finca Antequera: Antequera2026@
// - Casa Olmo: CasaOlmo2026@
// - Valle Hermoso: ValleHermoso2026@
// - Venta la Cuesta: VentaCuesta2026@
// - dptotecnico@agroptimum.com: TecnicosSensorica2026@
// - adminit@agroptimum.com: Mola2026Sensores

export const users: Omit<User, "passwordHash">[] = [
  {
    id: "finca_antequera",
    email: "finca_antequera",
    name: "Finca Antequera",
    role: "finca",
    allowedFarms: ["Finca_Antequera"],
  },
  {
    id: "casa_olmo",
    email: "casa_olmo",
    name: "Casa Olmo",
    role: "finca",
    allowedFarms: ["Casa_Olmo"],
  },
  {
    id: "valle_hermoso",
    email: "valle_hermoso",
    name: "Valle Hermoso",
    role: "finca",
    allowedFarms: ["Valle_Hermoso"],
  },
  {
    id: "venta_la_cuesta",
    email: "venta_la_cuesta",
    name: "Venta la Cuesta",
    role: "finca",
    allowedFarms: ["Venta_la_Cuesta"],
  },
  {
    id: "tecnico",
    email: "dptotecnico@agroptimum.com",
    name: "Departamento Técnico",
    role: "tecnico",
    allowedFarms: "all",
  },
  {
    id: "admin",
    email: "adminit@agroptimum.com",
    name: "Administrador",
    role: "admin",
    allowedFarms: "all",
  },
];

// Passwords en texto plano para verificación (en producción usar hash)
const passwords: Record<string, string> = {
  finca_antequera: "Antequera2026@",
  casa_olmo: "CasaOlmo2026@",
  valle_hermoso: "ValleHermoso2026@",
  venta_la_cuesta: "VentaCuesta2026@",
  tecnico: "TecnicosSensorica2026@",
  admin: "Mola2026Sensores",
};

export async function verifyCredentials(
  username: string,
  password: string
): Promise<Omit<User, "passwordHash"> | null> {
  // Buscar usuario por email o nombre de usuario
  const user = users.find(
    (u) =>
      u.email.toLowerCase() === username.toLowerCase() ||
      u.id === username.toLowerCase().replace(/\s+/g, "_")
  );

  if (!user) return null;

  // Verificar contraseña
  const correctPassword = passwords[user.id];
  if (password === correctPassword) {
    return user;
  }

  return null;
}

export function getUserAllowedFarms(user: Omit<User, "passwordHash">): string[] {
  if (user.allowedFarms === "all") {
    return ["Casa_Olmo", "Finca_Antequera", "Valle_Hermoso", "Venta_la_Cuesta"];
  }
  return user.allowedFarms;
}

export function canAccessFarm(
  user: Omit<User, "passwordHash">,
  farmId: string
): boolean {
  if (user.allowedFarms === "all") return true;
  return user.allowedFarms.includes(farmId);
}
