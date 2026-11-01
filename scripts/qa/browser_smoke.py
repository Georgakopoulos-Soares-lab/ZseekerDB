from playwright.sync_api import sync_playwright
from pathlib import Path
import json,csv,xml.etree.ElementTree as ET,re
import argparse
parser=argparse.ArgumentParser(description='Browser checks against the audited final ZSeekerDB dataset')
parser.add_argument('--base-url',default='http://127.0.0.1:18080')
parser.add_argument('--output',default='build/browser_checks')
args=parser.parse_args();base=args.base_url.rstrip('/')
root=Path(args.output);root.mkdir(parents=True,exist_ok=True)
errors=[];report={}
with sync_playwright() as p:
 browser=p.chromium.launch(headless=True,args=['--no-sandbox','--disable-dev-shm-usage'])
 context=browser.new_context(viewport={'width':1600,'height':1100},device_scale_factor=2,locale='en-US',color_scheme='light',accept_downloads=True)
 page=context.new_page();page.on('pageerror',lambda e:errors.append(str(e)))
 print('Loading actual homepage',flush=True)
 page.goto(base+'/',wait_until='domcontentloaded')
 page.get_by_text('324,200',exact=True).wait_for(timeout=120000)
 page.get_by_text('60,841',exact=True).wait_for(timeout=30000)
 page.get_by_text('108,425,047 bp',exact=True).wait_for(timeout=30000)
 page.get_by_text('47.7%',exact=True).wait_for(timeout=30000)
 page.screenshot(path=str(root/'homepage_full.png'),full_page=True)
 report['homepage_kpis']='324,200 / 60,841 / 108,425,047 bp / 47.7%'
 chart_options=page.locator('.echarts-for-react').evaluate_all("""elements=>elements.map(el=>{
  let f=el[Object.keys(el).find(k=>k.startsWith('__reactFiber'))];
  while(f && !f.stateNode?.getEchartsInstance)f=f.return;
  if(!f)return null;
  const o=f.stateNode.getEchartsInstance().getOption();
  return {yType:o.yAxis?.[0]?.type,yName:o.yAxis?.[0]?.name,legend:o.legend?.[0]?.show,
    values:o.series.flatMap(s=>s.data??[]).filter(d=>d!=null).map(d=>Number(d.value??d)),
    categories:o.yAxis?.[0]?.data,shortened:o.yAxis?.[0]?.axisLabel?.formatter?.('Methanobacteriati')};
 })""")
 assert len(chart_options)==4 and chart_options[0]['yType']==chart_options[2]['yType']=='log'
 assert chart_options[0]['yName']==chart_options[2]['yName']=='Counts'
 assert sum(chart_options[0]['values'])==324200
 assert len(chart_options[1]['categories'])==10 and all('unclassified' not in k.lower() for k in chart_options[1]['categories'])
 assert chart_options[1]['shortened']=='Methanobacter.'
 assert chart_options[3]['legend']==False
 chart_options[3]['point_count']=len(chart_options[3].pop('values',[]))
 for i,option in enumerate(chart_options):
  if i!=1:option.pop('shortened',None)
 report['homepage_chart_options']=chart_options
 for i,chart in enumerate(page.locator('.echarts-for-react').all()):
  chart.locator('..').locator('..').screenshot(path=str(root/f'homepage_chart_{i+1}.png'))
 page.get_by_text('Quick dataset insights',exact=True).locator('..').screenshot(path=str(root/'homepage_insights.png'))
 print('Loading actual human sequence search',flush=True)
 page.goto(base+'/explore?assembly=GCF_009914755.1',wait_until='domcontentloaded')
 page.get_by_role('textbox',name='Sequence contains',exact=True).fill('')
 chromosome=page.get_by_role('combobox',name='Chromosome',exact=True)
 chromosome.click();page.get_by_role('option',name='1',exact=True).wait_for(timeout=120000)
 labels=page.get_by_role('option').all_text_contents();report['human_chromosome_options']=labels
 assert 'NC_060925.1' not in labels and '1' in labels
 page.get_by_role('option',name='1',exact=True).click()
 page.get_by_role('button',name='APPLY',exact=True).click()
 page.get_by_text(re.compile(r'of\s+(?:20,757|20757)')).first.wait_for(timeout=120000)
 page.wait_for_function('()=>document.querySelectorAll("tbody tr td").length>5',timeout=120000)
 cells=page.locator('tbody tr').all()
 first=cells[0].locator('td').first.inner_text();assert first=='1',first
 page.screenshot(path=str(root/'human_results.png'),full_page=True)
 report['human_results_chromosome']=first
 for fmt,label in [('csv','CSV'),('tsv','TSV'),('json','JSON'),('xml','XML'),('xls','Excel')]:
  print('Checking client export '+fmt,flush=True)
  page.get_by_role('button',name='EXPORT',exact=True).click()
  with page.expect_download(timeout=120000) as download:
   page.get_by_role('menuitem',name='Export '+label,exact=True).click()
  path=root/('human_chr1.'+fmt);download.value.save_as(str(path))
  if fmt in ('csv','tsv'):
   rows=list(csv.DictReader(path.open(),delimiter='\t' if fmt=='tsv' else ','));assert rows and all(r['Chromosome']=='1' for r in rows)
  elif fmt=='json':
   rows=json.loads(path.read_text());assert rows and all(r['Chromosome']=='1' for r in rows)
  elif fmt=='xml':
   rows=ET.parse(path).findall('.//Chromosome');assert rows and all(r.text=='1' for r in rows)
  else:
   rows=re.findall(r'<tr><td>(.*?)</td>',path.read_text());assert rows and set(rows)=={'1'}
  report[fmt+'_export_rows']=len(rows)
 page.get_by_role('tab',name='Visualizations',exact=True).click()
 page.get_by_text('Predicted loci per 100 kb — 1',exact=True).wait_for(timeout=120000)
 page.wait_for_function("()=>document.querySelectorAll('.echarts-for-react').length===6",timeout=120000)
 page.wait_for_timeout(1500)
 page.screenshot(path=str(root/'human_visualizations.png'),full_page=True)
 report['visualization_chromosome']='1'
 server=context.request.get(base+'/api/zdna/export?assembly_eq=GCF_009914755.1&chr=NC_060925.1&limit=all')
 assert server.status==200
 server_path=root/'human_chr1_server.csv';server_path.write_bytes(server.body())
 rows=list(csv.DictReader(server_path.open()));assert len(rows)==20757 and all(r['Chromosome']=='1' for r in rows)
 report['server_csv_rows']=len(rows)
 report['page_errors']=errors
 assert not errors,errors
 browser.close()
(root/'browser_report.json').write_text(json.dumps(report,indent=2,allow_nan=False)+'\n');print(json.dumps({k:v for k,v in report.items() if k!='homepage_chart_options'},indent=2),flush=True)
