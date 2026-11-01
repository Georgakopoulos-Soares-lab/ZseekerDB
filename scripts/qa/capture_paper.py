from pathlib import Path
from playwright.sync_api import sync_playwright
import json,re,argparse,math
parser=argparse.ArgumentParser(description='Capture manuscript portal panels against the audited final database')
parser.add_argument('--output',type=Path,required=True);parser.add_argument('--base-url',default='http://127.0.0.1:18080');args=parser.parse_args()
out=args.output;out.mkdir(parents=True,exist_ok=True);base=args.base_url.rstrip('/')
with sync_playwright() as p:
 browser=p.chromium.launch(headless=True,args=['--no-sandbox','--disable-dev-shm-usage'])
 context=browser.new_context(viewport={'width':1600,'height':1100},device_scale_factor=2,locale='en-US',color_scheme='light')
 page=context.new_page();errors=[];responses=[];raw_responses=[]
 page.on('pageerror',lambda e:errors.append(str(e)))
 page.on('response',lambda r:(responses.append({'url':r.url,'status':r.status}),raw_responses.append(r)))
 page.goto(base+'/',wait_until='domcontentloaded');page.get_by_text('324,200',exact=True).wait_for(timeout=120000)
 hero=page.get_by_role('link',name='Start exploring',exact=True).bounding_box()
 page.screenshot(path=str(out/'paper_homepage_navigation.png'),clip={'x':0,'y':0,'width':1600,'height':math.ceil(hero['y']+hero['height']+45)})
 page.get_by_text('Quick dataset insights',exact=True).locator('..').screenshot(path=str(out/'homepage_insights.png'))
 print('Homepage captured',flush=True)
 page.goto(base+'/explore?assembly=GCF_009914755.1',wait_until='domcontentloaded');page.get_by_role('textbox',name='Sequence contains',exact=True).fill('')
 page.get_by_role('combobox',name='Chromosome',exact=True).click();page.get_by_role('option',name='1',exact=True).wait_for(timeout=120000);page.get_by_role('option',name='1',exact=True).click();page.get_by_role('button',name='APPLY',exact=True).click()
 page.get_by_text(re.compile(r'of\s+(?:20,757|20757)')).first.wait_for(timeout=120000)
 papers=page.locator('main .MuiPaper-root')
 print('papers',papers.count(),flush=True)
 for i,el in enumerate(papers.all()):print(i,el.inner_text()[:70],flush=True)
 page.screenshot(path=str(out/'paper_human_results.png'),clip={'x':260,'y':75,'width':1310,'height':1000})
 page.get_by_role('button',name='EXPORT',exact=True).click();page.get_by_role('menuitem',name='Export CSV',exact=True).wait_for();page.locator('.MuiMenu-paper').screenshot(path=str(out/'paper_export_menu.png'));page.keyboard.press('Escape')
 page.get_by_role('tab',name='Visualizations',exact=True).click();page.get_by_text('Predicted loci per 100 kb — 1',exact=True).wait_for(timeout=120000)
 page.wait_for_function("()=>document.querySelectorAll('.echarts-for-react').length===6",timeout=120000);page.wait_for_timeout(1500)
 for n,index in [('length',2),('density',4),('start',5),('histogram',0),('distribution',1),('boxplot',3)]:
  chart=page.locator('.echarts-for-react').nth(index);chart.locator('..').screenshot(path=str(out/f'paper_human_{n}.png'))
 print('Human plots captured',flush=True)
 responses.clear();raw_responses.clear();page.goto(base+'/metadatastats',wait_until='domcontentloaded')
 page.get_by_text('ZSeekerDB insights',exact=True).wait_for()
 page.wait_for_function("()=>document.querySelectorAll('.echarts-for-react').length>0",timeout=120000)
 page.wait_for_timeout(1500)
 assert not page.get_by_text(re.compile(r'^Error:')).count()
 assert any('OFFSET%2050000' in r['url'] and r['status']==200 for r in responses),responses
 hierarchy=[r.json()['data'] for r in raw_responses if 'GROUP%20BY%201%2C2%2C3%2C4%20ORDER' in r.url]
 hierarchy_rows=sum(len(rows) for rows in hierarchy)
 hierarchy_assemblies=sum(int(row['n']) for rows in hierarchy for row in rows)
 assert hierarchy_rows>50000 and hierarchy_assemblies==148217
 page.get_by_text('Taxon names',exact=True).wait_for()
 page.screenshot(path=str(out/'paper_species_insights.png'),full_page=True)
 (out/'additional_browser_checks.json').write_text(json.dumps({'errors':errors,'hierarchy_second_page':True,'hierarchy_rows':hierarchy_rows,'hierarchy_assemblies':hierarchy_assemblies,'api_failures':[r for r in responses if '/api/' in r['url'] and r['status']!=200]},indent=2)+'\n')
 assert not errors,errors
 print('Species insights pagination and rendering passed',flush=True)
 page.goto(base+'/about',wait_until='domcontentloaded');page.get_by_text(re.compile('Dataset built 2026-10-27;')).wait_for();page.get_by_text(re.compile('2,563,977,909 predicted loci')).wait_for()
 page.goto(base+'/download',wait_until='domcontentloaded');page.get_by_text(re.compile('Dataset built 2026-10-27;')).wait_for();assert not page.locator('a[href*="/draft/"]').count()
 print('About and Download provenance passed',flush=True)
 page.goto(base+'/metadata',wait_until='domcontentloaded');page.get_by_text(re.compile(r'of\s+(?:148,217|148217)')).first.wait_for(timeout=120000)
 page.screenshot(path=str(out/'paper_metadata_results.png'),clip={'x':260,'y':75,'width':1310,'height':950})
 page.get_by_role('button',name='APPLY',exact=True).click()
 page.get_by_role('tab',name='Visualizations',exact=True).click()
 page.wait_for_function("()=>document.querySelectorAll('.echarts-for-react').length===4",timeout=120000);page.wait_for_timeout(1500)
 for index,el in enumerate(page.locator('.echarts-for-react').all()):el.locator('..').screenshot(path=str(out/f'paper_metadata_chart_{index+1}.png'))
 assert not errors,errors
 print('Species browser and four visualization panels passed',flush=True)
 browser.close()
