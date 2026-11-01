"""Compose manuscript portal panels from actual browser captures and exported loci.

Screenshots come from scripts/qa/capture_paper.py. Figure 3 independently summarizes
chromosome-scoped loci from the validated server CSV, using 100 kb windows and
the first 20,000 loci by position. The portal uses ten windows and a hash sample.
"""
from pathlib import Path
import argparse,json
import numpy as np
import pandas as pd
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt

parser=argparse.ArgumentParser(description=__doc__)
parser.add_argument('captures',type=Path);parser.add_argument('output',type=Path)
args=parser.parse_args();args.output.mkdir(parents=True,exist_ok=True)
plt.rcParams.update({'font.size':15,'pdf.fonttype':42})

def read(name):return plt.imread(args.captures/name)
def panel(ax,arr,label):
 ax.imshow(arr);ax.axis('off');ax.set_title(label,loc='left',fontweight='bold',fontsize=22,pad=4)
def save(fig,number):
 for suffix in ['pdf','png']:fig.savefig(args.output/f'Figure_{number}.{suffix}',dpi=300,bbox_inches='tight',facecolor='white')
 plt.close(fig)

fig,axes=plt.subplots(2,1,figsize=(12,15),gridspec_kw={'height_ratios':[.42,.58]},constrained_layout=True)
panel(axes[0],read('paper_homepage_navigation.png'),'A')
panel(axes[1],read('homepage_insights.png'),'B');save(fig,1)

image=read('paper_human_results.png');fig=plt.figure(figsize=(12,8),constrained_layout=True);gs=fig.add_gridspec(2,4)
panel(fig.add_subplot(gs[0,:]),image[:810,:],'A')
panel(fig.add_subplot(gs[1,:3]),image[950:1760,:1900],'B')
panel(fig.add_subplot(gs[1,3]),read('paper_export_menu.png'),'C');save(fig,2)

# These figure scatters use the first 20,000 loci by Start, independently of
# the portal's deterministic hash sample. Windows include every matching locus.
df=pd.read_csv(args.captures/'human_chr1_server.csv').sort_values('Start').reset_index(drop=True)
assert len(df)==20757 and set(df.Chromosome.astype(str))=={'1'}
assert ((df.End-df.Start+1)==df.Sequence.str.len()).all()
sample=df.head(20000);bins=(df.Start//100000).value_counts().sort_index()
assert int(bins.sum())==len(df)
fig=plt.figure(figsize=(12,9),constrained_layout=True);gs=fig.add_gridspec(2,2)
ax=fig.add_subplot(gs[0,0]);ax.scatter(sample.End-sample.Start+1,sample['Z-DNA Score'],s=5,alpha=.45,color='#F08F2A',rasterized=True)
ax.set(xlabel='Predicted locus length (bp)',ylabel='ZSeeker score');ax.set_title('A',loc='left',fontweight='bold')
ax=fig.add_subplot(gs[0,1]);ax.bar(bins.index.to_numpy()*.1,bins.to_numpy(),width=.1,color='#4D77A9')
ax.set(xlabel='Chromosome 1 position (Mb)',ylabel='Predicted loci per 100 kb');ax.set_title('B',loc='left',fontweight='bold')
ax=fig.add_subplot(gs[1,:]);ax.scatter(sample.Start/1e6,sample['Z-DNA Score'],s=5,alpha=.45,color='#E25558',rasterized=True)
ax.set(xlabel='Chromosome 1 start position (Mb)',ylabel='ZSeeker score');ax.set_title('C',loc='left',fontweight='bold');save(fig,3)

image=read('paper_metadata_results.png');fig=plt.figure(figsize=(12,14),constrained_layout=True);gs=fig.add_gridspec(4,2,height_ratios=[.6,.9,1,1])
panel(fig.add_subplot(gs[0,:]),image[:510,:],'A')
panel(fig.add_subplot(gs[1,:]),image[560:1190,:],'B')
for index,label in enumerate('CDEF'):panel(fig.add_subplot(gs[2+index//2,index%2]),read(f'paper_metadata_chart_{index+1}.png'),label)
save(fig,4)

image=read('paper_species_insights.png');fig=plt.figure(figsize=(12,12),constrained_layout=True);gs=fig.add_gridspec(2,3,height_ratios=[.42,.58])
panel(fig.add_subplot(gs[0,:2]),image[410:1540,550:2420],'A')
panel(fig.add_subplot(gs[:,2]),image[390:2500,2440:3150],'B')
panel(fig.add_subplot(gs[1,:2]),image[1700:3120,840:2150],'C');save(fig,5)

fig=plt.figure(figsize=(12,9),constrained_layout=True);gs=fig.add_gridspec(2,2)
for ax,name,label in [(fig.add_subplot(gs[0,0]),'histogram','A'),(fig.add_subplot(gs[0,1]),'distribution','B'),(fig.add_subplot(gs[1,:]),'boxplot','C')]:
 panel(ax,read(f'paper_human_{name}.png'),label)
for suffix in ['pdf','png']:fig.savefig(args.output/f'Supplementary_Figure_1.{suffix}',dpi=300,bbox_inches='tight',facecolor='white')
plt.close(fig)
(args.output/'portal_figure_provenance.json').write_text(json.dumps({'assembly':'GCF_009914755.1','chromosome':'1','matching_loci':len(df),'length_and_start_plot_loci':len(sample),'window_count_loci':int(bins.sum()),'source':'validated server CSV and actual browser captures','browser_chart_sample_limit':20000,'figures':[1,2,3,4,5]},indent=2)+'\n')
print('Wrote Figures 1–5 from the final local portal and source-backed chromosome-1 export.')
