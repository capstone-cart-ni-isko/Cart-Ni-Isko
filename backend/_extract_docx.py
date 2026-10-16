import zipfile, re, html

z = zipfile.ZipFile('system-new.docx')
xml = z.read('word/document.xml').decode('utf-8', errors='ignore')
paras = re.split(r'</w:p>', xml)
out = []
for p in paras:
    texts = re.findall(r'<w:t[^>]*>(.*?)</w:t>', p, re.S)
    line = html.unescape(''.join(texts))
    out.append(line)
with open('system-new-clean.txt', 'w', encoding='utf-8') as f:
    f.write('\n'.join(out))
print('lines', len(out))
