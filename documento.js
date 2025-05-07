const express = require("express");
const fs = require('fs');
const { plainAddPlaceholder } = require('node-signpdf/dist/helpers');
const path = require('path');
const { SignPdf } = require('node-signpdf');
const { PDFDocument } = require('pdf-lib');
const QRCode = require('qrcode');
const forge = require('node-forge');

const app = express();
const PORT = 3000;

app.use(express.json());

function preparaArquvio(arquivo) {
  const nomeArquivo = path.basename(arquivo);
  const extensao = path.extname(arquivo);
  const caminho = path.dirname(arquivo);
  const pdfBuffer = fs.readFileSync(arquivo);
  const pdfWithPlaceholder = plainAddPlaceholder({ pdfBuffer });
  let arquivoGerado = caminho+'/'+nomeArquivo.replace(extensao, '')+'_preparado'+extensao; 
  fs.writeFileSync(arquivoGerado, pdfWithPlaceholder);   
  return arquivoGerado;
}

function assinarArquivo(arquivo, certificado, senhaCertificado) {
  const nomeArquivo = path.basename(arquivo);
  const extensao = path.extname(arquivo);
  const caminho = path.dirname(arquivo);
  const pdfBuffer = fs.readFileSync(arquivo);
  const p12Buffer = fs.readFileSync(certificado);
  const signedPdf = new SignPdf().sign(pdfBuffer, p12Buffer, { passphrase: senhaCertificado });
  let arquivoAssinado = caminho+'/'+nomeArquivo.replace('_preparado.pdf', '')+"_assinado"+extensao;
  fs.writeFileSync(arquivoAssinado, signedPdf);
  return arquivoAssinado;
}

async function inserirQRCode(arquivo) {
  const pdfBytes = fs.readFileSync(arquivo);
  const pdfDoc = await PDFDocument.load(pdfBytes, { updateMetadata: false });
  const qrCodeDataUrl = await QRCode.toDataURL('https://example.com');
  const qrImage = await pdfDoc.embedPng(qrCodeDataUrl);
  const pages = pdfDoc.getPages();
  const lastPage = pages[pages.length - 1];
  lastPage.drawImage(qrImage, {
      x: 50,
      y: 100,
      width: 150,
      height: 150
  });
  const modifiedPdfBytes = await pdfDoc.save({ useObjectStreams: false });
  fs.writeFileSync(arquivo, modifiedPdfBytes);
  console.log('QR Code inserido no PDF sem corromper o xref!');
}

app.post("/api/v1/assinar", async (req, res) => {  
  const dados = req.body;  
  let arquivoPreparado = preparaArquvio(dados.arquivo);
  let arquivoAssinado = assinarArquivo(arquivoPreparado, dados.certificado, dados.senha_certificado);
  fs.unlink(arquivoPreparado, (err) => {
      if (err) {
        res.send('Erro ao remover o arquivo:', err);
      } 
  }); 
  res.send("documento assinado : " + arquivoAssinado);
});

app.post("/api/v1/inserir-qrcode", async (req, res) => {  
  const dados = req.body; 
  inserirQRCode(dados.arquivo);
  res.send("QR-Code gerado com sucesso !!!");
});

app.listen(PORT, () => console.log("Servidor iniciado"));