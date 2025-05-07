const express = require("express");
const fs = require('fs');
const { plainAddPlaceholder } = require('node-signpdf/dist/helpers');
const path = require('path');
const { SignPdf } = require('node-signpdf');
const { PDFDocument, rgb } = require('pdf-lib');
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

async function inserirQRCode(arquivo, certificado, senha_certificado, url) {
  const pdfBytes = fs.readFileSync(arquivo);
  const pdfDoc = await PDFDocument.load(pdfBytes, { updateMetadata: false });
  const qrCodeDataUrl = await QRCode.toDataURL(url);
  const qrImage = await pdfDoc.embedPng(qrCodeDataUrl);
  const pages = pdfDoc.getPages();
  const lastPage = pages[pages.length - 1];
  const qrWidth = 150;
  const qrHeight = 150;
  const qrX = 50;
  const qrY = 100;
  lastPage.drawImage(qrImage, {
      x: qrX,
      y: qrY,
      width: qrWidth,
      height: qrHeight
  });
  const textX = qrX + qrWidth + 10;
  let textY = qrY + qrHeight - 30;
  const p12Buffer = fs.readFileSync(certificado);
  const p12Asn1 = forge.asn1.fromDer(p12Buffer.toString('binary'));
  const p12 = forge.pkcs12.pkcs12FromAsn1(p12Asn1, false, senha_certificado);
  const certBag = p12.getBags({ bagType: forge.pki.oids.certBag })[forge.pki.oids.certBag][0];
  const cert = certBag.cert;
  const titular = cert.subject.attributes.find(attr => attr.name === 'commonName')?.value;
  const emissor = cert.issuer.attributes.find(attr => attr.name === 'commonName')?.value;
  const validadeInicio = cert.validity.notBefore.toISOString();
  const validadeFim = cert.validity.notAfter.toISOString();
  const textos = [
    'Titular: '+titular,
    'Emissor: '+emissor,
    'Validade Início : '+validadeInicio,
    'Validade Fim : '+validadeFim
  ]

    textos.forEach(texto => {
        lastPage.drawText(texto, {
            x: textX,
            y: textY,
            size: 8,
            color: rgb(0, 0, 0) // Preto
        });
        textY -= 20;
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
  inserirQRCode(dados.arquivo, dados.certificado, dados.senha_certificado, dados.url);
  res.send("QR-Code gerado com sucesso !!!");
});

app.listen(PORT, () => console.log("Servidor iniciado"));