const express = require("express");
const fs = require("fs");
const path = require("path");

const app = express();
const PORT = 3001;

// Carpeta real en el servidor
const CARPETA_PLANOS = "V:\\Docs\\Productos\\Pdf_Archivo";

// Para servir los PDFs encontrados
app.use("/pdfs", express.static(CARPETA_PLANOS));

function normalizarTexto(txt) {
  return String(txt || "").trim().toUpperCase();
}

function extraerVersion(nombreArchivo) {
  const nombre = normalizarTexto(nombreArchivo);

  // Busca cosas tipo:
  // _V1 / -V2 / V3 / REV4 / R5
  const patrones = [
    /(?:^|[_\-. ])V(?:ER)?[_\-. ]?(\d+)(?:\D|$)/i,
    /(?:^|[_\-. ])REV[_\-. ]?(\d+)(?:\D|$)/i,
    /(?:^|[_\-. ])R[_\-. ]?(\d+)(?:\D|$)/i
  ];

  for (const p of patrones) {
    const match = nombre.match(p);
    if (match) return Number(match[1] || 0);
  }

  return 0;
}

function buscarArchivosPdfRecursivo(dir) {
  let resultados = [];

  const items = fs.readdirSync(dir, { withFileTypes: true });

  for (const item of items) {
    const fullPath = path.join(dir, item.name);

    if (item.isDirectory()) {
      resultados = resultados.concat(buscarArchivosPdfRecursivo(fullPath));
    } else if (item.isFile() && item.name.toLowerCase().endsWith(".pdf")) {
      resultados.push(fullPath);
    }
  }

  return resultados;
}

app.get("/api/buscar-plano", (req, res) => {
  try {
    const codigo = normalizarTexto(req.query.codigo);

    if (!codigo) {
      return res.status(400).json({ error: "Falta el código" });
    }

    if (!fs.existsSync(CARPETA_PLANOS)) {
      return res.status(500).json({ error: "No existe la carpeta de planos" });
    }

    const archivos = buscarArchivosPdfRecursivo(CARPETA_PLANOS);

    const candidatos = archivos
      .map(fullPath => {
        const nombre = path.basename(fullPath);
        return {
          fullPath,
          nombre,
          version: extraerVersion(nombre),
          codigoIncluido: normalizarTexto(nombre).includes(codigo)
        };
      })
      .filter(x => x.codigoIncluido);

    if (!candidatos.length) {
      return res.status(404).json({ error: `No se encontró plano para ${codigo}` });
    }

    candidatos.sort((a, b) => {
      if (b.version !== a.version) return b.version - a.version;

      const statA = fs.statSync(a.fullPath);
      const statB = fs.statSync(b.fullPath);
      return statB.mtimeMs - statA.mtimeMs;
    });

    const elegido = candidatos[0];
    const relativePath = path.relative(CARPETA_PLANOS, elegido.fullPath).replace(/\\/g, "/");

    return res.json({
      codigo,
      archivo: elegido.nombre,
      version: elegido.version,
      url: `/pdfs/${relativePath}`
    });
  } catch (error) {
    console.error("Error buscando plano:", error);
    return res.status(500).json({ error: "Error interno buscando el plano" });
  }
});

app.listen(PORT, () => {
  console.log(`Servidor de planos corriendo en http://localhost:${PORT}`);
});
