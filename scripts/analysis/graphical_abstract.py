"""Draw an editable graphical abstract from the audited catalog measurements."""
from pathlib import Path
import argparse,json
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
from matplotlib.patches import FancyBboxPatch,FancyArrowPatch

parser=argparse.ArgumentParser(description=__doc__)
parser.add_argument('audit',type=Path);parser.add_argument('output',type=Path)
args=parser.parse_args();stats=json.loads(args.audit.read_text());args.output.mkdir(parents=True,exist_ok=True)
plt.rcParams.update({'font.family':'DejaVu Sans','font.size':18,'svg.fonttype':'none','pdf.fonttype':42})
fig=plt.figure(figsize=(14,9),facecolor='#F3F6FA');ax=fig.add_axes([0,0,1,1]);ax.set(xlim=(0,14),ylim=(0,9));ax.axis('off')
blue='#176FC1';ink='#18324B';muted='#53697D'
ax.text(.5,8.24,'ZSeekerDB',fontsize=36,fontweight='bold',color=blue)
ax.text(.5,7.68,'Predicted Z-DNA- and Z-RNA-forming sequences',fontsize=24,color=ink)
for x,title in [(.4,'Catalog'),(5.0,'Search & export'),(9.6,'Quick dataset insights')]:
 ax.add_patch(FancyBboxPatch((x,1.25),4.0,5.85,boxstyle='round,pad=0.08,rounding_size=.14',facecolor='white',edgecolor='#D6E1ED',linewidth=1.3))
 ax.text(x+.22,6.55,title,fontsize=22 if x<9 else 20,fontweight='bold',color=ink)
for x in [4.55,9.15]:ax.add_patch(FancyArrowPatch((x-.10,4.2),(x+.26,4.2),arrowstyle='-|>',mutation_scale=24,color=blue,linewidth=2))

ax.text(.66,5.72,f'{stats["assemblies"]:,}',fontsize=30,fontweight='bold',color=blue)
ax.text(.66,5.27,'genome assemblies',color=muted)
ax.text(.66,4.52,f'{stats["predictions"]:,}',fontsize=26,fontweight='bold',color=blue)
ax.text(.66,4.07,'predicted loci',color=muted)
ax.text(.66,3.31,f'{stats["species_taxids"]:,}',fontsize=27,fontweight='bold',color=blue)
ax.text(.66,2.86,'species grouping IDs',color=muted)
ax.text(.66,1.84,'Assembly metadata include\ngenomes with no predictions.',fontsize=17,color=muted,linespacing=1.4)

ax.text(5.23,5.83,'Search predicted\nZ-DNA- and Z-RNA-forming\nsequences by species',fontsize=18,color=ink,linespacing=1.45,va='top')
ax.text(5.23,4.22,'Species · Chromosome\nCoordinates · Score · Sequence',fontsize=17,color=muted,linespacing=1.5,va='top')
ax.text(5.23,3.11,'Human: GCF_009914755.1\nChromosomes 1–22, X, Y',fontsize=17,color=blue,linespacing=1.4,va='top')
ax.text(5.23,1.86,'Interactive plots and exports\nCSV · TSV · JSON · XML · Excel',fontsize=16.5,color=muted,linespacing=1.4,va='bottom')

counts=dict(stats['superkingdoms']);colors={'Archaea':'#4D77A9','Bacteria':'#F08F2A','Eukaryota':'#E25558','Viruses':'#77B7B3'}
ax.text(9.85,6.14,'Assemblies by superkingdom',fontsize=16.5,color=muted)
for y,sk in zip([5.77,5.21,4.65,4.09],colors):
 ax.scatter([9.91],[y+.06],s=120,color=colors[sk]);ax.text(10.13,y,sk,fontsize=18,color=ink);ax.text(13.35,y,f'{counts[sk]:,}',ha='right',fontsize=18,color=ink)
ax.plot([9.85,13.35],[3.68,3.68],color='#D6E1ED',linewidth=1)
ax.text(9.85,3.19,'Species-balanced means',fontsize=17,color=muted)
ax.text(9.85,2.52,f'{stats["species_balanced_mean_genome_size"]:,.0f} bp',fontsize=25,fontweight='bold',color=blue)
ax.text(9.85,1.88,f'{stats["species_balanced_mean_gc"]:.1f}% GC',fontsize=25,fontweight='bold',color=blue)
ax.text(.5,.57,'RNA-virus entries are cDNA-scored sequence candidates; Z-RNA formation is not validated.',fontsize=17,color=muted)
for extension in ['svg','pdf','png']:fig.savefig(args.output/f'Graphical_abstract.{extension}',dpi=300,facecolor=fig.get_facecolor())
plt.close(fig)
print('Wrote editable SVG, PDF and PNG graphical abstract from audited catalog values.')
